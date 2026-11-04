[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$OutputSize = 128
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$outputPath = Join-Path $projectRoot "public/favicon.png"
$favicon = $null
$graphics = $null
$background = $null
$inkBrush = $null
$letterBrush = $null

try {
  $favicon = New-Object System.Drawing.Bitmap($OutputSize, $OutputSize)
  $graphics = [System.Drawing.Graphics]::FromImage($favicon)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # Match the app's ink and surface tokens with a simple Hilite H monogram.
  $inkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#141416"))
  $letterBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#FFFFFF"))
  $background = New-Object System.Drawing.Drawing2D.GraphicsPath
  $background.AddArc(4, 4, 40, 40, 180, 90)
  $background.AddArc(84, 4, 40, 40, 270, 90)
  $background.AddArc(84, 84, 40, 40, 0, 90)
  $background.AddArc(4, 84, 40, 40, 90, 90)
  $background.CloseFigure()
  $graphics.FillPath($inkBrush, $background)
  $graphics.FillRectangle($letterBrush, 34, 30, 14, 68)
  $graphics.FillRectangle($letterBrush, 80, 30, 14, 68)
  $graphics.FillRectangle($letterBrush, 48, 57, 32, 14)

  $favicon.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "Generated $outputPath with the Hilite H monogram."
}
finally {
  if ($letterBrush) { $letterBrush.Dispose() }
  if ($inkBrush) { $inkBrush.Dispose() }
  if ($background) { $background.Dispose() }
  if ($graphics) { $graphics.Dispose() }
  if ($favicon) { $favicon.Dispose() }
}
