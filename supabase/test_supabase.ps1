param(
    [ValidateSet("sleep", "wake")]
    [string]$Event = "sleep"
)

$envPath = "c:\Users\mjoua\OneDrive\Documents\data engineer\Voical\.env"
$anon = (Get-Content $envPath | Where-Object { $_ -match "^VITE_SUPABASE_ANON_KEY=" }) -replace "^VITE_SUPABASE_ANON_KEY=", ""

$headers = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $anon"
}

$body = @{
    event     = $Event
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

Write-Host "Envoi : event=$Event"

try {
    $resp = Invoke-WebRequest -Uri "https://kyienoqwrwdzlvtphmnh.supabase.co/functions/v1/sleep-webhook" `
        -Method POST -Headers $headers -Body $body -UseBasicParsing -ErrorAction Stop
    Write-Host "OK ($($resp.StatusCode)) : $($resp.Content)"
} catch [System.Net.WebException] {
    $webEx = $_.Exception
    Write-Host "Erreur HTTP $($webEx.Response.StatusCode)"
    if ($webEx.Response) {
        $stream = $webEx.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "Detail : $($reader.ReadToEnd())"
    }
} catch {
    Write-Host "Erreur : $($_.Exception.Message)"
}
