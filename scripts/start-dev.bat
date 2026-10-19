@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js and npm are required. Install Node 20 or newer, then run this again.
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js so npm is on PATH, then run this again.
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo Node is too old. Breeze needs Node 20 or newer.
  node -v
  exit /b 1
)

echo Breeze dev
node -v
npm -v
echo %CD%
echo.

call :install "." "root"
if errorlevel 1 exit /b 1
call :install "server" "server"
if errorlevel 1 exit /b 1
call :install "client" "client"
if errorlevel 1 exit /b 1

REM better-sqlite3 is compiled per OS and Node ABI. A Linux .node file
REM copied onto Windows will not load.
pushd server >nul
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.close();" >nul 2>&1
set "SQLITE_OK=%ERRORLEVEL%"
popd >nul
if not "%SQLITE_OK%"=="0" (
  echo.
  echo Rebuilding better-sqlite3 for this machine...
  call npm rebuild better-sqlite3 --prefix server
  if errorlevel 1 (
    echo.
    echo Could not compile better-sqlite3.
    echo Install the Visual Studio Build Tools ^(Desktop development with C++^),
    echo or run scripts\start-dev.sh from WSL.
    exit /b 1
  )
  pushd server >nul
  node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.close();" >nul 2>&1
  set "SQLITE_OK=%ERRORLEVEL%"
  popd >nul
  if not "%SQLITE_OK%"=="0" (
    echo better-sqlite3 still will not load after rebuild.
    exit /b 1
  )
  echo better-sqlite3 is ready.
)

netstat -ano | findstr /R /C:":3001 " /C:":5173 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo Port 3001 or 5173 is already in use.
  echo Stop the other Breeze process, then run this again.
  exit /b 1
)

echo.
echo Starting server on http://localhost:3001
echo Starting client on http://localhost:5173
echo Open http://localhost:5173
echo.
call npm run dev
exit /b %ERRORLEVEL%

:install
if not exist "%~1\node_modules\" (
  echo Installing %~2 dependencies...
  call npm install --prefix "%~1"
  exit /b %ERRORLEVEL%
)
echo %~2 dependencies are present.
exit /b 0
