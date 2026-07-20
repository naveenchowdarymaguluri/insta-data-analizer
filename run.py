import os
import sys
import subprocess

def check_and_install_dependencies():
    print("Checking dependencies...")
    dependencies = ["fastapi", "uvicorn", "pandas", "openpyxl", "jinja2", "multipart"]
    missing = []
    
    # Check each package
    for dep in dependencies:
        try:
            if dep == "multipart":
                import multipart
            else:
                __import__(dep)
        except ImportError:
            missing.append(dep)
            
    if missing:
        print(f"Missing dependencies: {', '.join(missing)}. Installing from requirements.txt...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)
            print("Successfully installed dependencies!")
        except Exception as e:
            print(f"Error installing dependencies: {e}")
            print("Please install them manually: pip install -r requirements.txt")
            sys.exit(1)
    else:
        print("All dependencies are satisfied!")

if __name__ == "__main__":
    check_and_install_dependencies()
    print("\n" + "="*60)
    print("  Instagram Analytics Dashboard Server is starting...")
    print("  Open your web browser and navigate to:")
    print("  --> http://localhost:8000")
    print("="*60 + "\n")
    
    import uvicorn
    # Start uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
