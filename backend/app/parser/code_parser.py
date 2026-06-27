import os
import re

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
                        rel_path = os.path.relpath(file_path, self.repo_path)
                        
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                            
                            if ext == '.php':
                                chunks.extend(self._parse_php(content, rel_path))
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
                    rel_path = os.path.relpath(file_path, self.repo_path)
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        
                        # Parse based on file type
                        if ext == '.php':
                            chunks.extend(self._parse_php(content, rel_path))
                        elif ext == '.py':
                            chunks.extend(self._parse_python(content, rel_path))
                        elif ext in ['.js', '.ts', '.tsx', '.jsx']:
                            chunks.extend(self._parse_js_ts(content, rel_path))
                    except Exception as e:
                        # Log error internally and continue
                        print(f"Error parsing file {rel_path}: {str(e)}")
                    
        return chunks

    def _parse_php(self, content: str, rel_path: str) -> list[dict]:
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

    def _parse_python(self, content: str, rel_path: str) -> list[dict]:
        """
        Parses Python files (FastAPI decorators, method logic).
        """
        chunks = []
        # Find function declarations
        func_regex = re.compile(r'(?:def|async def)\s+(\w+)\s*\((.*?)\):')
        lines = content.splitlines()
        
        matches = list(func_regex.finditer(content))
        for idx, match in enumerate(matches):
            func_name = match.group(1)
            start_pos = match.start()
            start_line = content.count('\n', 0, start_pos) + 1
            
            # Capture block by indentation
            indent_level = len(match.group(0)) - len(match.group(0).lstrip())
            
            # Find end of function block by indentation
            end_line = start_line
            func_lines = []
            
            # Grab lines until we see a line with smaller indentation (excluding blank lines)
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
                # If we hit a line with equal or less indentation than def, it's the end of function
                if line_indent <= indent_level and not line.startswith('@'):
                    break
                func_lines.append(line)
                end_line = l_idx + 1
                
            func_content = '\n'.join(func_lines)
            
            # Identify chunk type
            chunk_type = 'general_logic'
            # Look for route decorators right above the function
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
                'chunk_type': chunk_type
            })
            
        return chunks

    def _parse_js_ts(self, content: str, rel_path: str) -> list[dict]:
        """
        Parses JavaScript/TypeScript files (Express endpoints, middleware, logic).
        """
        chunks = []
        lines = content.splitlines()
        
        # Regex for express endpoints
        express_regex = re.compile(r'\.(get|post|put|delete|patch|use)\s*\(\s*[\'"`](.*?)[\'"`]')
        # Regex for function declarations
        func_regex = re.compile(r'(?:function\s+(\w+)|(const|let)\s+(\w+)\s*=\s*\((.*?)\)\s*=>)')
        
        # Express route file chunks
        for i, line in enumerate(lines):
            if express_regex.search(line):
                # Grab a 15-line window surrounding the express route definition
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
                
        # Class or regular function chunks
        matches = list(func_regex.finditer(content))
        for idx, match in enumerate(matches):
            func_name = match.group(1) or match.group(3) or f"arrow_func_{idx}"
            start_pos = match.start()
            start_line = content.count('\n', 0, start_pos) + 1
            
            # Simple brace count to find function end
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
            if any(term in func_content for term in ['req.user', 'next()', 'middleware', 'passport', 'jwt', 'Session', 'Role']):
                chunk_type = 'auth_rule'
                
            chunks.append({
                'file_path': rel_path,
                'content': func_content,
                'name': func_name,
                'start_line': start_line,
                'end_line': end_line,
                'chunk_type': chunk_type
            })
            
        return chunks
