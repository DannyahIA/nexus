#!/usr/bin/env python3
# Quick verification script for Nexus project structure

import os
import sys
from pathlib import Path

# Colors for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def check_file(path, name):
    """Check if file exists"""
    if os.path.isfile(path):
        print(f"{GREEN}✓{RESET} {name}")
        return True
    else:
        print(f"{RED}✗{RESET} {name} (NOT FOUND)")
        return False

def check_dir(path, name):
    """Check if directory exists"""
    if os.path.isdir(path):
        print(f"{GREEN}✓{RESET} {name}/")
        return True
    else:
        print(f"{RED}✗{RESET} {name}/ (NOT FOUND)")
        return False

def main():
    print("\n🔍 Nexus Project Structure Verification\n")
    
    root = Path(__file__).parent
    os.chdir(root)
    
    checks = {
        "Documentation": [
            ("README.md", "README"),
            ("PROJECT_SPEC.md", "Project Specification"),
            ("SETUP.md", "Setup Guide"),
            ("STATUS.md", "Implementation Status"),
            ("SUMMARY.md", "Project Summary"),
        ],
        "Backend": [
            ("backend/go.mod", "Go modules"),
            ("backend/.env.example", ".env example"),
            ("backend/cmd/api/main.go", "API Server"),
            ("backend/cmd/ws/main.go", "WebSocket Server"),
            ("backend/cmd/media/main.go", "Media Server"),
            ("backend/internal/models/types.go", "Data models"),
            ("backend/internal/database/cassandra.go", "Cassandra client"),
            ("backend/internal/services/nats_services.go", "NATS services"),
            ("backend/internal/handlers/auth.go", "Auth handler"),
            ("backend/internal/cache/memory.go", "Memory cache"),
        ],
        "Frontend": [
            ("frontend/app.json", "Expo config"),
            ("frontend/package.json", "Package config"),
            ("frontend/tsconfig.json", "TypeScript config"),
            ("frontend/app/store/appState.ts", "State management"),
            ("frontend/app/services/api.ts", "API client"),
            ("frontend/app/hooks/useAppState.ts", "Custom hooks"),
            ("frontend/app/screens/LoginScreen.tsx", "Login screen"),
            ("frontend/app/screens/ChatScreen.tsx", "Chat screen"),
            ("frontend/app/screens/TasksScreen.tsx", "Tasks screen"),
            ("frontend/app/components/MessageList.tsx", "Message list"),
            ("frontend/app/components/MessageInput.tsx", "Message input"),
        ],
        "Infrastructure": [
            ("docker-compose.yml", "Docker Compose"),
            ("infrastructure/cassandra/init.cql", "Cassandra schema"),
            ("infrastructure/turn/turnserver.conf", "TURN config"),
        ],
        "Automation": [
            ("Makefile", "Makefile"),
            ("setup.sh", "Setup script"),
        ],
    }
    
    all_passed = True
    total_files = 0
    checked_files = 0
    
    for category, files in checks.items():
        print(f"\n📂 {category}:")
        print("─" * 50)
        
        for file_path, display_name in files:
            total_files += 1
            if check_file(file_path, display_name):
                checked_files += 1
            else:
                all_passed = False
    
    # Check directories
    print(f"\n📁 Directories:")
    print("─" * 50)
    
    dirs = [
        ("backend/cmd", "Backend commands"),
        ("backend/internal", "Backend internal"),
        ("frontend/app/screens", "Frontend screens"),
        ("frontend/app/components", "Frontend components"),
        ("infrastructure", "Infrastructure"),
    ]
    
    for dir_path, display_name in dirs:
        total_files += 1
        if check_dir(dir_path, display_name):
            checked_files += 1
        else:
            all_passed = False
    
    # Summary
    print("\n" + "=" * 50)
    print(f"\n📊 Summary: {checked_files}/{total_files} items verified\n")
    
    if all_passed:
        print(f"{GREEN}✓ All files and directories present!{RESET}\n")
        print("🚀 Next steps:")
        print("   1. make setup     # Setup development environment")
        print("   2. make build     # Build services")
        print("   3. make run       # Run all services")
        print("   4. make docker    # Start Docker containers")
        print("\n✨ Or start coding directly!\n")
        return 0
    else:
        print(f"{RED}✗ Some items are missing!{RESET}\n")
        print("Please ensure all required files exist.\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
