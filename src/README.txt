Copy lifecycle.rules.test.cjs into the root of C:\dev\deacon-projects (next to firestore.rules).

With the Firestore emulator running on its default port 8080, in a SECOND PowerShell terminal:
  cd C:\dev\deacon-projects
  npm install --save-dev @firebase/rules-unit-testing
  node .\lifecycle.rules.test.cjs

If emulator is not using port 8080, change port: 8080 in the test file.
The script uses a separate emulator test project and does not access production Firestore.
Send back the complete PASS/FAIL output, particularly the first result.
