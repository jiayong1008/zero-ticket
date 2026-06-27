import re
import sqlglot
from sqlglot import exp, parse_one
from fastapi import HTTPException

# Maps database column names to expected JWT claim names
CLAIM_COLUMN_MAPPING = {
    'tenant_id': 'tenant_id',
    'company_id': 'company_id',
    'user_id': 'user_id',
    'owner_id': 'user_id',
    'customer_id': 'user_id',
    'client_id': 'tenant_id',
}

def escape_sql_value(val) -> str:
    """
    Safely formats and escapes values for injection in the generated SQL statement.
    """
    if isinstance(val, (int, float)):
        return str(val)
    # Convert to string and escape single quotes to prevent injection
    val_str = str(val).replace("'", "''")
    return f"'{val_str}'"

class SQLSecurityGuard:
    def __init__(self, db_schema: dict):
        """
        db_schema: The schema dictionary returned by SchemaExtractor.extract_schema.
                   Structure: { table_name: { 'columns': [ { 'name': ... } ] } }
        """
        self.schema = db_schema

    def validate_and_rewrite(self, sql_query: str, jwt_claims: dict) -> str:
        """
        Parses the query, ensures it is read-only, automatically injects tenant constraints,
        and enforces limits.
        """
        # 1. Basic sanity check - reject obvious write keywords in the raw string first
        forbidden_regex = re.compile(
            r'\b(insert|update|delete|drop|alter|truncate|replace|create|rename|grant|revoke)\b', 
            re.IGNORECASE
        )
        if forbidden_regex.search(sql_query):
            raise HTTPException(
                status_code=403, 
                detail="Security violation: Query contains write/mutation commands."
            )

        # 2. Parse query using sqlglot
        try:
            expression = parse_one(sql_query, read="mysql")
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Failed to parse SQL query: {str(e)}"
            )

        # 3. Verify it is a SELECT statement
        # Check root level. It must be a Select or Union, etc.
        if not isinstance(expression, (exp.Select, exp.Union)):
            raise HTTPException(
                status_code=403, 
                detail="Security violation: Query must be a SELECT statement."
            )

        # Walk the AST to make sure there are absolutely no write statements nested
        for node in expression.walk():
            if isinstance(node, (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Alter, exp.Create)):
                raise HTTPException(
                    status_code=403, 
                    detail="Security violation: Query contains mutating statements."
                )

        # 4. Inject Tenant Constraints
        # We walk all Table nodes in the AST and replace them with scoped subqueries
        def transform_table_node(node):
            if isinstance(node, exp.Table):
                table_name = node.name
                alias = node.alias
                
                # Check if this table exists in our schema
                if table_name in self.schema:
                    table_cols = [col['name'] for col in self.schema[table_name]['columns']]
                    
                    # Find all applicable security columns and claims
                    filters = []
                    for col_name, claim_name in CLAIM_COLUMN_MAPPING.items():
                        if col_name in table_cols and claim_name in jwt_claims:
                            claim_val = jwt_claims[claim_name]
                            if claim_val is not None:
                                filters.append(f"`{col_name}` = {escape_sql_value(claim_val)}")
                    
                    # If we found security columns, rewrite table to a subquery
                    if filters:
                        where_clause = " AND ".join(filters)
                        subquery_sql = f"(SELECT * FROM `{table_name}` WHERE {where_clause})"
                        
                        # Generate the new parsed node
                        subquery_node = parse_one(subquery_sql, read="mysql")
                        
                        # Apply original alias to the subquery
                        if alias:
                            subquery_node = exp.alias_(subquery_node, alias)
                        else:
                            subquery_node = exp.alias_(subquery_node, table_name)
                            
                        return subquery_node
            return node

        # Apply transformation recursively
        rewritten_expression = expression.transform(transform_table_node)

        # 5. Enforce LIMIT 10
        # If query has a limit, override it if it is > 10. If no limit, append limit 10.
        has_limit = False
        limit_val = 10
        
        # Check if the outer expression has a limit node
        if isinstance(rewritten_expression, exp.Select):
            limit_node = rewritten_expression.args.get("limit")
            if limit_node:
                has_limit = True
                try:
                    limit_val = int(limit_node.expression.this)
                    if limit_val > 10:
                        limit_node.expression.this = "10"
                except Exception:
                    limit_node.expression.this = "10"
            else:
                rewritten_expression = rewritten_expression.limit(10)
        else:
            # If it's a Union, wrap it or append limit
            rewritten_expression = exp.select("*").from_(rewritten_expression.subquery("union_sub")).limit(10)

        # Convert back to SQL string
        final_sql = rewritten_expression.sql(dialect="mysql")
        return final_sql
