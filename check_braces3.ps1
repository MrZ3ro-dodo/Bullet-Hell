$lines = Get-Content "script.js" | Select-Object -Skip 4642 -First 350
$open = 0
$close = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    $open += ([regex]::Matches($line, '\{')).Count
    $close += ([regex]::Matches($line, '\}')).Count
    Write-Host ($i + 4643) $line
    Write-Host ("  opens=$open closes=$close balance=" + ($open - $close))
}
