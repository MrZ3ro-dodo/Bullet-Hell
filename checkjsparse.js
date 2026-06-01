var fso = new ActiveXObject("Scripting.FileSystemObject");
var file = fso.OpenTextFile("c:\\Users\\Usuario\\Downloads\\Bullet-Hell\\script.js", 1);
var content = file.ReadAll();
file.Close();
try {
    new Function(content);
    WScript.Echo("OK");
} catch (e) {
    WScript.Echo("ERR: " + e.message + " at line " + e.lineNumber + ", char " + e.number);
}
