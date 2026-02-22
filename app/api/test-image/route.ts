import { NextResponse } from 'next/server';

// This route generates a test PNG image with a simulated Gemini watermark
// using raw pixel manipulation (no canvas dependency needed server-side)
export async function GET() {
  // We'll redirect to the static HTML page that generates the image client-side
  // Instead, return a simple SVG that looks like a Gemini watermarked image
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a237e"/>
        <stop offset="100%" stop-color="#4a148c"/>
      </linearGradient>
    </defs>
    
    <!-- Background -->
    <rect width="800" height="600" fill="url(#bg)"/>
    
    <!-- Content area -->
    <rect x="50" y="50" width="700" height="400" fill="rgba(255,255,255,0.1)" rx="12"/>
    
    <!-- Title -->
    <text x="400" y="200" font-family="sans-serif" font-size="32" font-weight="bold" 
          fill="white" text-anchor="middle">Sample AI Generated Image</text>
    <text x="400" y="250" font-family="sans-serif" font-size="18" 
          fill="rgba(255,255,255,0.7)" text-anchor="middle">This is a test image with a simulated watermark</text>
    
    <!-- Decorative circles -->
    <circle cx="150" cy="330" r="40" fill="rgba(220,80,80,0.6)"/>
    <circle cx="270" cy="330" r="40" fill="rgba(180,160,80,0.6)"/>
    <circle cx="390" cy="330" r="40" fill="rgba(80,160,100,0.6)"/>
    <circle cx="510" cy="330" r="40" fill="rgba(80,180,200,0.6)"/>
    <circle cx="630" cy="330" r="40" fill="rgba(100,100,200,0.6)"/>
    
    <!-- Gemini watermark bar -->
    <rect x="0" y="545" width="800" height="55" fill="rgba(245,245,250,0.95)"/>
    
    <!-- Gemini text (multicolor) -->
    <text x="310" y="578" font-family="sans-serif" font-size="20" font-weight="bold" fill="#4285F4">G</text>
    <text x="324" y="578" font-family="sans-serif" font-size="20" font-weight="bold" fill="#EA4335">e</text>
    <text x="337" y="578" font-family="sans-serif" font-size="20" font-weight="bold" fill="#FBBC05">m</text>
    <text x="352" y="578" font-family="sans-serif" font-size="20" font-weight="bold" fill="#34A853">i</text>
    <text x="362" y="578" font-family="sans-serif" font-size="20" fill="#5f6368">ni · Generated with AI</text>
    
    <!-- G logo in corner -->
    <circle cx="770" cy="572" r="16" fill="#4285F4"/>
    <text x="770" y="578" font-family="sans-serif" font-size="16" font-weight="bold" 
          fill="white" text-anchor="middle">G</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache',
    },
  });
}
