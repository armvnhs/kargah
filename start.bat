@echo off
cd /d "%~dp0"
start "" python -c "import time,webbrowser;time.sleep(1.5);webbrowser.open('http://127.0.0.1:8765/')"
echo Kargah is starting... keep this window open so prices stay live.
python server.py
pause
