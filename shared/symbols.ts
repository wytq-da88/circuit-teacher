import type { ComponentType } from './types';

/** Adapted from Sketch2Schematic AI's svgMarkupForIecSymbol and IEC_SYMBOL_GEOMETRY.
 * Copyright (c) 2026 Vitaliy Hnatyk, MIT. See licenses/sketch2schematic.
 * Source commit: 2b097ce55f711e7968a7a996169eaf1f926bfe57.
 * Terminal leads normalized to ±50; switch state, meters, rheostat added locally.
 */
export const IEC_SYMBOL_GEOMETRY = {
  resistor: { bodyWidth: 46, bodyHeight: 16, leadInset: 23 },
  battery: { leadInset: 14, longPlateHalfHeight: 26, shortPlateHalfHeight: 16 },
  switch: { leadHalf: 50, terminalOffset: 18, armRise: 22 },
  lamp: { leadHalf: 50, innerLead: 24, radius: 24 },
} as const;

// Self-contained so the same function can be embedded in offline files.
export function symbolMarkup(type:ComponentType,closed=false,lit=false):string {
  const half=50;
  switch(type) {
    case 'resistor': return `<path d="M${-half} 0H-23M23 0H${half}"/><rect x="-23" y="-8" width="46" height="16" fill="none"/>`;
    case 'battery': return `<path d="M${-half} 0H-14M14 0H${half}M-14 -26V26M14 -16V16"/><text x="-29" y="-31" font-size="15" fill="currentColor" stroke="none">+</text><text x="20" y="-23" font-size="15" fill="currentColor" stroke="none">−</text>`;
    case 'switch': return `<path d="M-50 0H-18M18 0H50M-18 0L18 ${closed?0:-22}"/><circle cx="-18" cy="0" r="3" fill="currentColor"/><circle cx="18" cy="0" r="3" fill="currentColor"/>`;
    case 'lamp': return `<circle cx="0" cy="0" r="24" fill="${lit?'#fde68a':'#ffffff'}"/><path d="M-50 0H-24M24 0H50M-16 -16L16 16M16 -16L-16 16"/>`;
    case 'ammeter': case 'voltmeter': return `<path d="M-50 0H-24M24 0H50"/><circle cx="0" cy="0" r="24" fill="#ffffff"/><text x="0" y="8" text-anchor="middle" font-size="24" font-weight="600" stroke="none" fill="currentColor">${type==='ammeter'?'A':'V'}</text>`;
    case 'rheostat': return `<path d="M-50 0H-23M23 0H50"/><rect x="-23" y="-8" width="46" height="16" fill="none"/><path d="M0 -40V-10M0 -10L-5 -18M0 -10L5 -18"/>`;
  }
}

export const SYMBOL_LICENSE=`MIT License
Copyright (c) 2026 Vitaliy Hnatyk
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
