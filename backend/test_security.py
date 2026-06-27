import sys
from app.engine.security import SQLSecurityGuard

def run_tests():
    print("=== ZeroTicket SQL Security Guard Test ===")
    
    # 1. Mock DB Schema
    mock_schema = {
        "users": {
            "columns": [
                {"name": "id", "type": "int", "nullable": False},
                {"name": "name", "type": "varchar", "nullable": False},
                {"name": "email", "type": "varchar", "nullable": False},
                {"name": "password", "type": "varchar", "nullable": False},
                {"name": "tenant_id", "type": "int", "nullable": False}
            ]
        },
        "payments": {
            "columns": [
                {"name": "id", "type": "int", "nullable": False},
                {"name": "amount", "type": "decimal", "nullable": False},
                {"name": "user_id", "type": "int", "nullable": False},
                {"name": "status", "type": "varchar", "nullable": False}
            ]
        },
        "products": {
            "columns": [
                {"name": "id", "type": "int", "nullable": False},
                {"name": "name", "type": "varchar", "nullable": False},
                {"name": "price", "type": "decimal", "nullable": False}
            ]
        }
    }
    
    guard = SQLSecurityGuard(mock_schema)
    
    # 2. Mock JWT Claims context
    mock_jwt = {
        "user_id": 852,
        "tenant_id": 1,
        "role": "user"
    }

    # Test Case 1: Select only verification (blocking mutations)
    mutating_queries = [
        "UPDATE users SET role = 'admin' WHERE id = 852",
        "DELETE FROM payments WHERE id = 1",
        "INSERT INTO payments (amount, user_id) VALUES (100, 852)",
        "DROP TABLE users",
        "SELECT * FROM users; DROP TABLE users;",
    ]
    
    print("\n--- Testing Mutation Blocking ---")
    for sql in mutating_queries:
        try:
            guard.validate_and_rewrite(sql, mock_jwt)
            print(f"❌ FAILED: Mutating SQL was allowed: {sql}")
        except Exception as e:
            print(f"✅ PASSED (Blocked): {sql} -> {str(e)}")

    # Test Case 2: Tenant/User constraint injection
    print("\n--- Testing Security Filter Injection ---")
    test_cases = [
        {
            "name": "Single table with tenant_id",
            "query": "SELECT * FROM users",
            "expected_contain": ["WHERE `tenant_id` = 1", "LIMIT 10"]
        },
        {
            "name": "Single table with user_id",
            "query": "SELECT amount, status FROM payments ORDER BY id DESC",
            "expected_contain": ["WHERE `user_id` = 852", "LIMIT 10"]
        },
        {
            "name": "Table without security columns (no filters injected, only limits)",
            "query": "SELECT * FROM products",
            "expected_contain": ["LIMIT 10"],
            "expected_not_contain": ["WHERE"]
        },
        {
            "name": "Complex JOIN query (injects filters in both tables)",
            "query": "SELECT u.name, p.amount FROM users u JOIN payments p ON u.id = p.user_id",
            "expected_contain": ["WHERE `tenant_id` = 1", "WHERE `user_id` = 852"]
        }
    ]

    for tc in test_cases:
        try:
            rewritten = guard.validate_and_rewrite(tc["query"], mock_jwt)
            print(f"\nTest: {tc['name']}")
            print(f"  Input:  {tc['query']}")
            print(f"  Output: {rewritten}")
            
            passed = True
            for term in tc["expected_contain"]:
                if term not in rewritten:
                    print(f"  ❌ FAILED: Missing expected term '{term}'")
                    passed = False
            
            if "expected_not_contain" in tc:
                for term in tc["expected_not_contain"]:
                    if term in rewritten:
                        print(f"  ❌ FAILED: Contains forbidden term '{term}'")
                        passed = False
            
            if passed:
                print("  ✅ PASSED")
        except Exception as e:
            print(f"  ❌ ERROR running test {tc['name']}: {str(e)}")

if __name__ == "__main__":
    run_tests()
