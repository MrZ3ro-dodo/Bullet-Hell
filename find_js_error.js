var fso = new ActiveXObject("Scripting.FileSystemObject");
var file = fso.OpenTextFile("c:\\Users\\Usuario\\Downloads\\Bullet-Hell\\script.js", 1);
var content = file.ReadAll();
file.Close();
var lines = content.split(/\r?\n/);
function canParse(upTo) {
    var text = lines.slice(0, upTo).join("\n");
    try { new Function(text); return true; } catch (e) { return false; }
}
var lo = 1, hi = lines.length;
var failing = 0;
while (lo <= hi) {
    var mid = Math.floor((lo + hi) / 2);
    if (canParse(mid)) {
        lo = mid + 1;
    } else {
        failing = mid;
        hi = mid - 1;
    }
}
WScript.Echo('first failing prefix line:' + failing);
for (var i = Math.max(1, failing-3); i <= Math.min(lines.length, failing+3); i++) {
    WScript.Echo(i + ': ' + lines[i-1]);
}
