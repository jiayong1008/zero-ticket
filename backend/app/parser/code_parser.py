import os
import re

class PrismaParser:
    @staticmethod
    def parse(content: str, rel_path: str) -> list[dict]:
        """
        Parses Prisma schema files, splitting them into individual model/enum blocks.
        """
        chunks = []
        lines = content.splitlines()
        
        # Regex to match model, enum, datasource, or generator definitions
        block_regex = re.compile(r'(model|enum|datasource|generator)\s+(\w+)\s*\{(.*?)\}', re.DOTALL)
        
        matches = list(block_regex.finditer(content))
        for match in matches:
            block_type = match.group(1)
            block_name = match.group(2)
            block_content = match.group(0)
            
            start_pos = match.start()
            start_line = content.count('\n', 0, start_pos) + 1
            end_line = start_line + block_content.count('\n')
            
            chunk_type = 'model' if block_type == 'model' else 'general_logic'
            
            chunks.append({
                'file_path': rel_path,
                'content': block_content,
                'name': f"{block_type}_{block_name}",
                'start_line': start_line,
                'end_line': end_line,
                'chunk_type': chunk_type
            })
            
        if not chunks and content.strip():
            chunks.append({
                'file_path': rel_path,
                'content': content,
                'name': 'prisma_schema_fallback',
                'start_line': 1,
                'end_line': len(lines),
                'chunk_type': 'general_logic'
            })
            
        return chunks


class PythonParser:
    @staticmethod
    def parse(content: str, rel_path: str) -> list[dict]:
        """
        Parses Python files (FastAPI decorators, method logic, Django/SQLAlchemy models).
        """
        chunks = []
        lines = content.splitlines()
        
        # Detect database model definition file
        is_model_file = (
            'models.py' in rel_path.lower() or 
            '/models/' in rel_path.lower() or 
            '\\models\\' in rel_path.lower() or
            '/entities/' in rel_path.lower() or
            '\\entities\\' in rel_path.lower() or
            'sqlalchemy' in content.lower() or 
            'sqlmodel' in content.lower() or 
            'django.db' in content.lower()
        )
        
        # If it's a model file and has class declarations, treat the whole file as a single model chunk
        if is_model_file and ('class ' in content):
            class_match = re.search(r'class\s+(\w+)', content)
            class_name = class_match.group(1) if class_match else "PythonModel"
            chunks.append({
                'file_path': rel_path,
                'content': content,
                'name': class_name,
                'start_line': 1,
                'end_line': len(lines),
                'chunk_type': 'model'
            })
            return chunks

        # Check if it's a Django/Flask route routing file (e.g. urls.py or routes.py)
        is_route_file = 'urls.py' in rel_path.lower() or 'routes.py' in rel_path.lower()
        if is_route_file:
            chunks.append({
                'file_path': rel_path,
                'content': content,
                'name': 'python_routes',
                'start_line': 1,
                'end_line': len(lines),
                'chunk_type': 'route'
            })
            return chunks
            
        # Parse functions
        func_regex = re.compile(r'(?:def|async def)\s+(\w+)\s*\((.*?)\):')
        matches = list(func_regex.finditer(content))
        
        for idx, match in enumerate(matches):
            func_name = match.group(1)
            start_pos = match.start()
            start_line = content.count('\n', 0, start_pos) + 1
            
            indent_level = len(match.group(0)) - len(match.group(0).lstrip())
            
            end_line = start_line
            func_lines = []
            
            for l_idx in range(start_line - 1, len(lines)):
                line = lines[l_idx]
                if l_idx == start_line - 1:
                    func_lines.append(line)
                    continue
                
                stripped = line.strip()
                if not stripped:
                    func_lines.append(line)
                    continue
                
                line_indent = len(line) - len(line.lstrip())
                if line_indent <= indent_level and not line.startswith('@'):
                    break
                func_lines.append(line)
                end_line = l_idx + 1
                
            func_content = '\n'.join(func_lines)
            
            chunk_type = 'general_logic'
            decorators = []
            for d_idx in range(start_line - 2, max(-1, start_line - 5), -1):
                if lines[d_idx].strip().startswith('@'):
                    decorators.append(lines[d_idx])
                else:
                    break
            
            if decorators:
                chunk_type = 'route'
                
            if any(term in func_content for term in ['Depends', 'current_user', 'Security', 'Role', 'Permission', 'JWT']):
                chunk_type = 'auth_rule'
                
            chunks.append({
                'file_path': rel_path,
                'content': '\n'.join(decorators[::-1]) + '\n' + func_content,
                'name': func_name,
                'start_line': max(1, start_line - len(decorators)),
                'end_line': end_line,
                'chunk_type': 'chunk_type' if chunk_type == 'auth_rule' else chunk_type
            })
            
            # Map chunk_type correctly to ensure API response compatibility
            if chunks[-1]['chunk_type'] == 'chunk_type':
                chunks[-1]['chunk_type'] = 'auth_rule'
            
        if not chunks and content.strip():
            chunks.append({
                'file_path': rel_path,
                'content': content,
                'name': 'python_file_fallback',
                'start_line': 1,
                'end_line': len(lines),
                'chunk_type': 'general_logic'
            })
            
        return chunks


class JavaScriptParser:
    @staticmethod
    def parse(content: str, rel_path: str) -> list[dict]:
        """
        Parses JavaScript/TypeScript files (Express endpoints, Next.js API routes, Mongoose/Sequelize models).
        """
        chunks = []
        lines = content.splitlines()
        
        is_model_file = (
            'models.ts' in rel_path.lower() or 
            'models.js' in rel_path.lower() or 
            '/models/' in rel_path.lower() or 
            '\\models\\' in rel_path.lower() or
            '/entities/' in rel_path.lower() or
            '\\entities\\' in rel_path.lower() or
            'mongoose.model' in content or
            'sequelize.define' in content or
            '@Entity' in content
        )
        
        if is_model_file:
            model_name = "JSModel"
            mongoose_match = re.search(r'mongoose\.model\s*\(\s*[\'"`](\w+)[\'"`]', content)
            sequelize_match = re.search(r'\b(?:sequelize\.define|define)\s*\(\s*[\'"`](\w+)[\'"`]', content)
            class_match = re.search(r'class\s+(\w+)', content)
            
            if mongoose_match:
                model_name = mongoose_match.group(1)
            elif sequelize_match:
                model_name = sequelize_match.group(1)
            elif class_match:
                model_name = class_match.group(1)
            else:
                for line in lines:
                    if 'require(' in line or 'import ' in line:
                        continue
                    m = re.search(r'(?:const|let|var)\s+(\w+)\s*=', line)
                    if m:
                        model_name = m.group(1)
                        break
                        
            chunks.append({
                'file_path': rel_path,
                'content': content,
                'name': model_name,
                'start_line': 1,
                'end_line': len(lines),
                'chunk_type': 'model'
            })
            return chunks

        is_next_api = (
            'app/api/' in rel_path.replace('\\', '/') or 
            'pages/api/' in rel_path.replace('\\', '/') or
            'route.ts' in rel_path.lower() or 
            'route.js' in rel_path.lower()
        )
        
        # Express route paths must start with a slash / or wildcard * to avoid matching general utility .get('attribute') calls
        express_regex = re.compile(r'\.(get|post|put|delete|patch|use)\s*\(\s*[\'"`]([\/*].*?)[\'"`]')
        func_regex = re.compile(r'(?:function\s+(\w+)|(const|let|var)\s+(\w+)\s*=\s*\((.*?)\)\s*=>|(?:async\s+)?(\w+)\s*\((.*?)\)\s*\{)')
        
        for i, line in enumerate(lines):
            if express_regex.search(line):
                start = max(0, i - 2)
                end = min(len(lines), i + 15)
                chunks.append({
                    'file_path': rel_path,
                    'content': '\n'.join(lines[start:end]),
                    'name': f"route_definition_line_{i+1}",
                    'start_line': start + 1,
                    'end_line': end,
                    'chunk_type': 'route'
                })
                
        matches = list(func_regex.finditer(content))
        for idx, match in enumerate(matches):
            func_name = match.group(1) or match.group(3) or match.group(5) or f"arrow_func_{idx}"
            if func_name in ['if', 'for', 'while', 'switch', 'catch', 'let', 'const', 'var']:
                continue
                
            start_pos = match.start()
            start_line = content.count('\n', 0, start_pos) + 1
            
            brace_count = 0
            body_started = False
            end_pos = start_pos
            for p in range(start_pos, len(content)):
                char = content[p]
                if char == '{':
                    brace_count += 1
                    body_started = True
                elif char == '}':
                    brace_count -= 1
                    
                if body_started and brace_count == 0:
                    end_pos = p + 1
                    break
            
            if end_pos == start_pos:
                end_line = min(len(lines), start_line + 15)
                func_content = '\n'.join(lines[start_line-1:end_line])
            else:
                func_content = content[start_pos:end_pos]
                end_line = content.count('\n', 0, end_pos) + 1
                
            chunk_type = 'general_logic'
            if is_next_api or '@Controller' in content or any(n in func_name.upper() for n in ['GET', 'POST', 'PUT', 'DELETE', 'HANDLER']):
                chunk_type = 'route'
                
            if any(term in func_content for term in ['req.user', 'next()', 'middleware', 'passport', 'jwt', 'Session', 'Role', 'auth(']):
                chunk_type = 'auth_rule'
                
            chunks.append({
                'file_path': rel_path,
                'content': func_content,
                'name': func_name,
                'start_line': start_line,
                'end_line': end_line,
                'chunk_type': chunk_type
            })
            
        if not chunks and content.strip():
            chunk_type = 'route' if is_next_api else 'general_logic'
            chunks.append({
                'file_path': rel_path,
                'content': content,
                'name': 'js_file_fallback',
                'start_line': 1,
                'end_line': len(lines),
                'chunk_type': chunk_type
            })
            
        return chunks


class PHPParser:
    @staticmethod
    def parse(content: str, rel_path: str) -> list[dict]:
        """
        Parses PHP files (specifically looking for Laravel route, controller, policy & Gate rules).
        """
        chunks = []
        lines = content.splitlines()
        
        # 1. Detect routes (e.g. routes/web.php or routes/api.php)
        if 'routes/' in rel_path:
            # Group routes into logical chunks of 5-10 lines
            buffer = []
            start_line = 1
            for i, line in enumerate(lines):
                buffer.append(line)
                if len(buffer) >= 15 or 'Route::' in line:
                    if buffer:
                        chunks.append({
                            'file_path': rel_path,
                            'content': '\n'.join(buffer),
                            'name': f"route_group_line_{start_line}",
                            'start_line': start_line,
                            'end_line': i + 1,
                            'chunk_type': 'route'
                        })
                        buffer = []
                        start_line = i + 2
            if buffer:
                chunks.append({
                    'file_path': rel_path,
                    'content': '\n'.join(buffer),
                    'name': f"route_group_line_{start_line}",
                    'start_line': start_line,
                    'end_line': len(lines),
                    'chunk_type': 'route'
                })

        # 2. Extract PHP classes & methods (Controllers, Policies, Models)
        # Using regex to find method/function declarations
        method_regex = re.compile(r'(?:public|protected|private)?\s+function\s+(\w+)\s*\((.*?)\)')
        class_regex = re.compile(r'class\s+(\w+)')
        
        current_class = "Global"
        class_match = class_regex.search(content)
        if class_match:
            current_class = class_match.group(1)
            
        # Special casing for Eloquent Models: treat the entire file as a single chunk to preserve structure
        if 'app/Models/' in rel_path or 'app/Models\\' in rel_path:
            chunks.append({
                'file_path': rel_path,
                'content': content,
                'name': current_class,
                'start_line': 1,
                'end_line': len(lines),
                'chunk_type': 'model'
            })
            return chunks
            
        matches = list(method_regex.finditer(content))
        for idx, match in enumerate(matches):
            method_name = match.group(1)
            start_pos = match.start()
            
            # Find matching braces to extract full method body
            start_line = content.count('\n', 0, start_pos) + 1
            
            # Simple brace counting
            brace_count = 0
            body_started = False
            end_pos = start_pos
            for p in range(start_pos, len(content)):
                char = content[p]
                if char == '{':
                    brace_count += 1
                    body_started = True
                elif char == '}':
                    brace_count -= 1
                    
                if body_started and brace_count == 0:
                    end_pos = p + 1
                    break
            
            # Fallback if brace count doesn't match perfectly
            if end_pos == start_pos:
                if idx + 1 < len(matches):
                    end_pos = matches[idx+1].start()
                else:
                    end_pos = len(content)
                    
            method_content = content[start_pos:end_pos]
            end_line = content.count('\n', 0, end_pos) + 1
            
            # Analyze function content for auth checks (Gates, Policies, Middleware)
            chunk_type = 'general_logic'
            if any(term in method_content for term in ['Gate::', 'authorize', 'middleware', 'auth()', 'Permission', 'Role']):
                chunk_type = 'auth_rule'
                
            chunks.append({
                'file_path': rel_path,
                'content': method_content,
                'name': f"{current_class}::{method_name}",
                'start_line': start_line,
                'end_line': end_line,
                'chunk_type': chunk_type
            })
            
        return chunks


class CodeParser:
    def __init__(self, repo_path: str):
        self.repo_path = os.path.abspath(repo_path)
        
        # Directories/files to exclude from scanning (excluding UI, boilerplate, and database files)
        self.exclude_dirs = {
            'node_modules', '.git', '.venv', 'venv', 'vendor', 
            'tests', 'test', 'dist', 'build', 'storage', 
            '.next', 'public', 'assets', 'bower_components',
            'Filament', 'Livewire', 'Console', 'Mail', 'Notifications',
            'Exports', 'Imports', 'database', 'resources', 'packages',
            'telegram-storage-exp', 'scripts'
        }
        self.exclude_extensions = {
            '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', 
            '.css', '.scss', '.less', '.html', '.json', '.lock', 
            '.md', '.pdf', '.zip', '.tar', '.gz', '.blade.php'
        }
        
    def scan_repository(self) -> list[dict]:
        """
        Scans the repository and returns chunks of code representing 
        routes, authorization rules, and database-interacting business logic.
        """
        chunks = []
        if not os.path.exists(self.repo_path):
            return chunks
            
        is_laravel = os.path.exists(os.path.join(self.repo_path, "artisan"))
        
        if is_laravel:
            target_dirs = [
                os.path.join(self.repo_path, "app/Models"),
                os.path.join(self.repo_path, "app/Http/Controllers"),
                os.path.join(self.repo_path, "routes")
            ]
            for t_dir in target_dirs:
                if not os.path.exists(t_dir):
                    continue
                for root, dirs, files in os.walk(t_dir):
                    for file in files:
                        ext = os.path.splitext(file)[1].lower()
                        if ext in self.exclude_extensions or file.startswith('.'):
                            continue
                            
                        file_path = os.path.join(root, file)
                        rel_path = file_path
                        
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                            
                            if ext == '.php':
                                chunks.extend(PHPParser.parse(content, rel_path))
                        except Exception as e:
                            print(f"Error parsing file {rel_path}: {str(e)}")
        else:
            for root, dirs, files in os.walk(self.repo_path):
                # Prune directory search
                dirs[:] = [d for d in dirs if d not in self.exclude_dirs and not d.startswith('.')]
                
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in self.exclude_extensions or file.startswith('.'):
                        continue
                        
                    file_path = os.path.join(root, file)
                    rel_path = file_path
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        
                        # Parse based on file type
                        if ext == '.php':
                            chunks.extend(PHPParser.parse(content, rel_path))
                        elif ext == '.py':
                            chunks.extend(PythonParser.parse(content, rel_path))
                        elif ext in ['.js', '.ts', '.tsx', '.jsx']:
                            chunks.extend(JavaScriptParser.parse(content, rel_path))
                        elif ext == '.prisma':
                            chunks.extend(PrismaParser.parse(content, rel_path))
                    except Exception as e:
                        # Log error internally and continue
                        print(f"Error parsing file {rel_path}: {str(e)}")
                    
        # Ingest recent Git commit history as a virtual chunk
        git_dir = os.path.join(self.repo_path, ".git")
        if os.path.exists(git_dir):
            try:
                import subprocess
                result = subprocess.run(
                    ["git", "log", "-n", "15", "--pretty=format:Commit: %h | Author: %an | Date: %ad | %s", "--date=relative"],
                    cwd=self.repo_path,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=False
                )
                if result.returncode == 0 and result.stdout.strip():
                    commit_log = result.stdout.strip()
                    git_file_path = os.path.join(self.repo_path, "git_history.txt")
                    chunks.append({
                        'file_path': git_file_path,
                        'content': f"Recent Git Commit History (Last 15 updates):\n\n{commit_log}",
                        'name': 'GitCommitHistory',
                        'start_line': 1,
                        'end_line': len(commit_log.splitlines()) + 2,
                        'chunk_type': 'general_logic'
                    })
                    print(f"[Git Ingestion] Successfully ingested {len(commit_log.splitlines())} commits into virtual chunk.")
            except Exception as e:
                print(f"[Git Ingestion Error] Failed to scan git logs: {e}")

        return chunks
