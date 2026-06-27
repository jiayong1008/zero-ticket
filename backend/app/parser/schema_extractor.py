import pymysql

class SchemaExtractor:
    def __init__(self, conn):
        self.conn = conn
        self.sensitive_keywords = {'password', 'pass', 'token', 'secret', 'key', 'salt', 'card', 'cvv', 'auth', 'ssn'}

    def is_sensitive(self, column_name: str) -> bool:
        """
        Heuristic to determine if a column name indicates sensitive data.
        """
        name_lower = column_name.lower()
        return any(keyword in name_lower for keyword in self.sensitive_keywords)

    def extract_schema(self, db_name: str) -> dict:
        """
        Extracts table definitions, column types, constraints, and sample data from the database.
        """
        schema = {}
        
        with self.conn.cursor() as cursor:
            # 1. Get all tables in the database
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
            """, (db_name,))
            tables = [row['table_name'] for row in [{k.lower(): v for k, v in r.items()} for r in cursor.fetchall()]]
            
            for table in tables:
                schema[table] = {
                    'columns': [],
                    'primary_keys': [],
                    'foreign_keys': [],
                    'samples': []
                }
                
                # 2. Get column information
                cursor.execute("""
                    SELECT column_name, data_type, is_nullable, column_key, column_default
                    FROM information_schema.columns 
                    WHERE table_schema = %s AND table_name = %s
                """, (db_name, table))
                cols = [{k.lower(): v for k, v in r.items()} for r in cursor.fetchall()]
                
                for col in cols:
                    col_info = {
                        'name': col['column_name'],
                        'type': col['data_type'],
                        'nullable': col['is_nullable'] == 'YES',
                        'default': col['column_default']
                    }
                    schema[table]['columns'].append(col_info)
                    
                    if col['column_key'] == 'PRI':
                        schema[table]['primary_keys'].append(col['column_name'])
                        
                # 3. Get foreign keys
                cursor.execute("""
                    SELECT column_name, referenced_table_name, referenced_column_name 
                    FROM information_schema.key_column_usage 
                    WHERE table_schema = %s AND table_name = %s AND referenced_table_name IS NOT NULL
                """, (db_name, table))
                fks = [{k.lower(): v for k, v in r.items()} for r in cursor.fetchall()]
                for fk in fks:
                    schema[table]['foreign_keys'].append({
                        'column': fk['column_name'],
                        'referenced_table': fk['referenced_table_name'],
                        'referenced_column': fk['referenced_column_name']
                    })
                    
                # 4. Get sample data (excluding sensitive columns)
                non_sensitive_cols = [c['name'] for c in schema[table]['columns'] if not self.is_sensitive(c['name'])]
                
                if non_sensitive_cols:
                    # Select only non-sensitive columns
                    col_selection = ", ".join([f"`{c}`" for c in non_sensitive_cols])
                    try:
                        cursor.execute(f"SELECT {col_selection} FROM `{table}` LIMIT 3")
                        samples = cursor.fetchall()
                        schema[table]['samples'] = samples
                    except Exception as e:
                        # Log error and skip sample extraction for this table
                        print(f"Skipping sample extraction for table {table}: {str(e)}")
                        schema[table]['samples'] = []
                        
        return schema

    def format_schema_for_llm(self, schema: dict) -> str:
        """
        Formats the extracted schema into a structured, readable string for LLM prompting.
        """
        output = []
        for table, details in schema.items():
            output.append(f"Table: {table}")
            
            # Columns
            col_strs = []
            for col in details['columns']:
                pk_indicator = " (PK)" if col['name'] in details['primary_keys'] else ""
                nullable_indicator = " NULL" if col['nullable'] else " NOT NULL"
                sensitive_indicator = " [SENSITIVE - HIDDEN]" if self.is_sensitive(col['name']) else ""
                col_strs.append(f"  - {col['name']}: {col['type']}{pk_indicator}{nullable_indicator}{sensitive_indicator}")
            output.extend(col_strs)
            
            # Foreign keys
            if details['foreign_keys']:
                output.append("  Foreign Keys:")
                for fk in details['foreign_keys']:
                    output.append(f"  - {fk['column']} -> {fk['referenced_table']}({fk['referenced_column']})")
                    
            # Samples (only if samples exist)
            if details['samples']:
                output.append("  Sample Rows:")
                for sample in details['samples']:
                    output.append(f"    - {str(sample)}")
                    
            output.append("") # blank line separator
            
        return "\n".join(output)
