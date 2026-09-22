param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\img\dc-logo-source.png'),
  [string]$OutDir = (Join-Path $PSScriptRoot '..\assets\img')
)

Add-Type @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;

public static class DcLogoCleaner
{
  static bool IsWhite(byte r, byte g, byte b) { return r > 232 && g > 232 && b > 232; }
  static bool IsRed(byte r, byte g, byte b) { return r > 110 && (r - g) > 15 && (r - b) > 15; }

  static int Idx(int w, int x, int y) { return y * w + x; }

  public static void Clean(string input, string output, int size)
  {
    using (var loaded = new Bitmap(input))
    {
      int workSize = Math.Max(loaded.Width, loaded.Height);
      if (workSize > 640) workSize = 640;
      if (size > 0 && size < workSize) workSize = Math.Max(size, 512);
      Bitmap src;
      if (loaded.Width != workSize || loaded.Height != workSize)
      {
        src = new Bitmap(workSize, workSize, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(src))
        {
          g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
          g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          g.Clear(Color.Transparent);
          g.DrawImage(loaded, 0, 0, workSize, workSize);
        }
      }
      else src = new Bitmap(loaded);

      using (src)
      {
      int w = src.Width, h = src.Height, n = w * h;
      var keep = new bool[n];
      var R = new byte[n]; var G = new byte[n]; var B = new byte[n];

      for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
        {
          int i = Idx(w, x, y);
          Color c = src.GetPixel(x, y);
          keep[i] = true;
          R[i] = c.R; G[i] = c.G; B[i] = c.B;
        }

      var q = new Queue<int>();
      for (int x = 0; x < w; x++)
        foreach (int y in new[] { 0, h - 1 })
        {
          int i = Idx(w, x, y);
          if (keep[i] && IsWhite(R[i], G[i], B[i])) { keep[i] = false; q.Enqueue(i); }
        }
      for (int y = 0; y < h; y++)
        foreach (int x in new[] { 0, w - 1 })
        {
          int i = Idx(w, x, y);
          if (keep[i] && IsWhite(R[i], G[i], B[i])) { keep[i] = false; q.Enqueue(i); }
        }

      int[] dx = { -1, 1, 0, 0 };
      int[] dy = { 0, 0, -1, 1 };
      while (q.Count > 0)
      {
        int i = q.Dequeue();
        int x = i % w, y = i / w;
        for (int d = 0; d < 4; d++)
        {
          int nx = x + dx[d], ny = y + dy[d];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          int ni = Idx(w, nx, ny);
          if (!keep[ni] || !IsWhite(R[ni], G[ni], B[ni])) continue;
          keep[ni] = false; q.Enqueue(ni);
        }
      }

      for (int pass = 0; pass < 6; pass++)
      {
        var remove = new List<int>();
        for (int y = 0; y < h; y++)
          for (int x = 0; x < w; x++)
          {
            int i = Idx(w, x, y);
            if (!keep[i] || IsRed(R[i], G[i], B[i])) continue;
            bool outside = false, nearRed = false;
            for (int d = 0; d < 4; d++)
            {
              int nx = x + dx[d], ny = y + dy[d];
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) { outside = true; continue; }
              int ni = Idx(w, nx, ny);
              if (!keep[ni]) { outside = true; continue; }
              if (IsRed(R[ni], G[ni], B[ni])) nearRed = true;
            }
            if (nearRed && R[i] > 190 && G[i] > 190 && B[i] > 190) continue;
            if (outside && (R[i] > 150 || G[i] > 130 || B[i] > 130)) remove.Add(i);
          }
        foreach (int ri in remove) keep[ri] = false;
      }

      using (var outBmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
      {
        for (int y = 0; y < h; y++)
          for (int x = 0; x < w; x++)
          {
            int i = Idx(w, x, y);
            outBmp.SetPixel(x, y, keep[i] ? Color.FromArgb(255, R[i], G[i], B[i]) : Color.FromArgb(0, 0, 0, 0));
          }

        Bitmap finalBmp = outBmp;
        if (size > 0 && (w != size || h != size))
        {
          finalBmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
          using (var g = Graphics.FromImage(finalBmp))
          {
            g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.Clear(Color.Transparent);
            g.DrawImage(outBmp, 0, 0, size, size);
          }
        }
        finalBmp.Save(output, ImageFormat.Png);
        if (!ReferenceEquals(finalBmp, outBmp)) finalBmp.Dispose();
      }
      }
    }
  }
}
"@ -ReferencedAssemblies System.Drawing

[DcLogoCleaner]::Clean($Source, (Join-Path $OutDir 'dc-logo.png'), 512)
[DcLogoCleaner]::Clean($Source, (Join-Path $OutDir 'dc-logo-128.png'), 128)
[DcLogoCleaner]::Clean($Source, (Join-Path $OutDir 'dc-logo-64.png'), 64)
Write-Host OK
