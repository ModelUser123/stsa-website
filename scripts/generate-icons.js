#!/usr/bin/env node
/**
 * STSA Icon Generator
 * Generates PWA icons using @napi-rs/canvas
 * Design: navy blue rounded-square bg + burnt-orange star + white "STSA" text
 */

const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const NAVY = '#1a3a52';
const ORANGE = '#c05621';
const WHITE = '#ffffff';
const ICONS_DIR = path.join(__dirname, '..', 'icons');

/**
 * Draw a 5-pointed star centered at (cx, cy) with outer radius r, inner radius ri
 */
function drawStar(ctx, cx, cy, r, ri, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : ri;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw a rounded rectangle
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const pad = size * 0.04;
  const radius = size * 0.22; // corner radius

  // Background: navy rounded square
  ctx.fillStyle = NAVY;
  roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, radius);
  ctx.fill();

  // Star: centered, with slight upward offset to make room for text
  const cx = size / 2;
  const starCy = size * 0.42;
  const outerR = size * 0.28;
  const innerR = size * 0.12;

  // Orange star shadow/glow — subtle depth
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = size * 0.04;
  drawStar(ctx, cx, starCy, outerR, innerR, ORANGE);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // "STSA" text — white, bold, below the star
  const fontSize = size * 0.175;
  ctx.fillStyle = WHITE;
  ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textY = size * 0.76;
  ctx.fillText('STSA', cx, textY);

  // Subtle tagline for large sizes
  if (size >= 256) {
    const smallSize = size * 0.065;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `400 ${smallSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText('EVENTS', cx, textY + fontSize * 0.7);
  }

  return canvas.toBuffer('image/png');
}

const sizes = [192, 512, 180];
const filenames = {
  192: 'icon-192.png',
  512: 'icon-512.png',
  180: 'icon-180.png',
};

for (const size of sizes) {
  const buf = generateIcon(size);
  const outPath = path.join(ICONS_DIR, filenames[size]);
  fs.writeFileSync(outPath, buf);
  console.log(`✅ Generated ${filenames[size]} (${size}x${size})`);
}

// Also create favicon.png at 32x32 (copy of 192 scaled)
const favBuf = generateIcon(32);
fs.writeFileSync(path.join(ICONS_DIR, 'favicon.png'), favBuf);
console.log('✅ Generated favicon.png (32x32)');

console.log('\n🎉 All icons generated in icons/');
