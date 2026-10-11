import { normalizedSymbolLength } from './symbols.js';

export const IEC_SYMBOL_GEOMETRY = {
  resistor: { bodyWidth: 46, bodyHeight: 16, leadInset: 23 },
  fuse: { bodyWidth: 28, bodyHeight: 12, leadInset: 14 },
  capacitor: { leadHalf: 55, plateGap: 12, plateHalfHeight: 18 },
  battery: { leadInset: 14, longPlateHalfHeight: 26, shortPlateHalfHeight: 16 },
  diode: { bodyHalf: 22, triHalfHeight: 21, barHalfHeight: 23 },
  zener: { bodyHalf: 22, triHalfHeight: 21, barHalfHeight: 23, zOffset: 7 },
  led: { bodyHalf: 22, triHalfHeight: 21, barHalfHeight: 23 },
  scr: { bodyHalf: 22, triHalfHeight: 21, barHalfHeight: 23 },
  inductor: { leadHalf: 60, innerLead: 38, loopRadius: 10, loopStep: 18 },
  source: { leadHalf: 60, innerLead: 24, radius: 24 },
  switch: { leadHalf: 60, terminalOffset: 18, armRise: 22 },
  ground: { stem: 42 },
  lamp: { leadHalf: 60, innerLead: 24, radius: 24 },
};

export function drawIecArrowToContext(context, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 7;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.moveTo(x2, y2);
  context.lineTo(
    x2 - head * Math.cos(angle - Math.PI / 6),
    y2 - head * Math.sin(angle - Math.PI / 6),
  );
  context.moveTo(x2, y2);
  context.lineTo(
    x2 - head * Math.cos(angle + Math.PI / 6),
    y2 - head * Math.sin(angle + Math.PI / 6),
  );
  context.stroke();
}

export function drawIecArrowToPixi(graphics, x1, y1, x2, y2, strokeStyle) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 7;
  graphics
    .moveTo(x1, y1)
    .lineTo(x2, y2)
    .moveTo(x2, y2)
    .lineTo(
      x2 - head * Math.cos(angle - Math.PI / 6),
      y2 - head * Math.sin(angle - Math.PI / 6),
    )
    .moveTo(x2, y2)
    .lineTo(
      x2 - head * Math.cos(angle + Math.PI / 6),
      y2 - head * Math.sin(angle + Math.PI / 6),
    )
    .stroke(strokeStyle());
}

function drawLeadsToContext(context, half, inner) {
  context.beginPath();
  context.moveTo(-half, 0);
  context.lineTo(-inner, 0);
  context.moveTo(inner, 0);
  context.lineTo(half, 0);
  context.stroke();
}

function drawLeadsToPixi(graphics, half, inner, strokeStyle) {
  graphics
    .moveTo(-half, 0)
    .lineTo(-inner, 0)
    .moveTo(inner, 0)
    .lineTo(half, 0)
    .stroke(strokeStyle());
}

export function drawIecSymbolToContext(context, object) {
  const half = normalizedSymbolLength(object) / 2;
  const g = IEC_SYMBOL_GEOMETRY;

  switch (object.type) {
    case 'resistor': {
      const { bodyWidth, bodyHeight, leadInset } = g.resistor;
      drawLeadsToContext(context, half, leadInset);
      context.strokeRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
      break;
    }
    case 'fuse': {
      const { bodyWidth, bodyHeight, leadInset } = g.fuse;
      drawLeadsToContext(context, half, leadInset);
      context.strokeRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
      break;
    }
    case 'capacitor': {
      const { leadHalf, plateGap, plateHalfHeight } = g.capacitor;
      drawLeadsToContext(context, leadHalf, plateGap + 1);
      context.save();
      context.lineWidth = 4.6;
      context.beginPath();
      context.moveTo(-plateGap, -plateHalfHeight);
      context.lineTo(-plateGap, plateHalfHeight);
      context.moveTo(plateGap, -plateHalfHeight);
      context.lineTo(plateGap, plateHalfHeight);
      context.stroke();
      context.restore();
      break;
    }
    case 'battery': {
      const { leadInset, longPlateHalfHeight, shortPlateHalfHeight } = g.battery;
      drawLeadsToContext(context, half, leadInset + 1);
      context.save();
      context.beginPath();
      context.lineWidth = 4;
      context.moveTo(-leadInset, -longPlateHalfHeight);
      context.lineTo(-leadInset, longPlateHalfHeight);
      context.stroke();
      context.beginPath();
      context.lineWidth = 2.2;
      context.moveTo(leadInset, -shortPlateHalfHeight);
      context.lineTo(leadInset, shortPlateHalfHeight);
      context.stroke();
      context.restore();
      break;
    }
    case 'diode':
    case 'zener':
    case 'led':
    case 'scr': {
      const { bodyHalf, triHalfHeight, barHalfHeight } = g[object.type === 'led' ? 'diode' : object.type];
      drawLeadsToContext(context, half, bodyHalf);
      context.beginPath();
      context.moveTo(-bodyHalf, -triHalfHeight);
      context.lineTo(bodyHalf, 0);
      context.lineTo(-bodyHalf, triHalfHeight);
      context.closePath();
      context.stroke();
      context.beginPath();
      context.moveTo(bodyHalf, -barHalfHeight);
      context.lineTo(bodyHalf, barHalfHeight);
      context.stroke();
      if (object.type === 'zener') {
        context.beginPath();
        context.moveTo(bodyHalf, -barHalfHeight);
        context.lineTo(bodyHalf + 7, -barHalfHeight + 5);
        context.moveTo(bodyHalf, barHalfHeight);
        context.lineTo(bodyHalf - 7, barHalfHeight - 5);
        context.stroke();
      }
      if (object.type === 'led') {
        drawIecArrowToContext(context, -3, -29, -20, -44);
        drawIecArrowToContext(context, 12, -27, -5, -42);
      }
      if (object.type === 'scr') {
        context.beginPath();
        context.moveTo(-8, 28);
        context.lineTo(-8, 16);
        context.lineTo(6, 4);
        context.stroke();
      }
      break;
    }
    case 'inductor': {
      const { leadHalf, innerLead, loopRadius, loopStep } = g.inductor;
      context.beginPath();
      context.moveTo(-leadHalf, 0);
      context.lineTo(-innerLead, 0);
      for (let i = 0; i < 4; i += 1) context.arc(-innerLead + loopRadius + i * loopStep, 0, loopRadius, Math.PI, 0);
      context.lineTo(leadHalf, 0);
      context.stroke();
      break;
    }
    case 'source': {
      const { leadHalf, innerLead, radius } = g.source;
      drawLeadsToContext(context, leadHalf, innerLead);
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.moveTo(-7, -8);
      context.lineTo(7, -8);
      context.moveTo(0, -15);
      context.lineTo(0, -1);
      context.moveTo(-7, 9);
      context.lineTo(7, 9);
      context.stroke();
      break;
    }
    case 'switch': {
      const { leadHalf, terminalOffset, armRise } = g.switch;
      context.beginPath();
      context.moveTo(-leadHalf, 0);
      context.lineTo(-terminalOffset, 0);
      context.moveTo(terminalOffset, 0);
      context.lineTo(leadHalf, 0);
      context.moveTo(-terminalOffset, 0);
      context.lineTo(terminalOffset, -armRise);
      context.stroke();
      context.beginPath();
      context.arc(-terminalOffset, 0, 3, 0, Math.PI * 2);
      context.arc(terminalOffset, 0, 3, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'ground': {
      context.beginPath();
      context.moveTo(0, -42);
      context.lineTo(0, 0);
      context.moveTo(-24, 0);
      context.lineTo(24, 0);
      context.moveTo(-16, 8);
      context.lineTo(16, 8);
      context.moveTo(-8, 16);
      context.lineTo(8, 16);
      context.stroke();
      break;
    }
    case 'lamp': {
      const { leadHalf, innerLead, radius } = g.lamp;
      drawLeadsToContext(context, leadHalf, innerLead);
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.moveTo(-16, -16);
      context.lineTo(16, 16);
      context.moveTo(16, -16);
      context.lineTo(-16, 16);
      context.stroke();
      break;
    }
    default:
      break;
  }
}

export function drawIecSymbolToPixi(graphics, object, strokeStyle) {
  const half = normalizedSymbolLength(object) / 2;
  const g = IEC_SYMBOL_GEOMETRY;

  switch (object.type) {
    case 'resistor': {
      const { bodyWidth, bodyHeight, leadInset } = g.resistor;
      drawLeadsToPixi(graphics, half, leadInset, strokeStyle);
      graphics.rect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight).stroke(strokeStyle());
      break;
    }
    case 'fuse': {
      const { bodyWidth, bodyHeight, leadInset } = g.fuse;
      drawLeadsToPixi(graphics, half, leadInset, strokeStyle);
      graphics.rect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight).stroke(strokeStyle());
      break;
    }
    case 'capacitor': {
      const { leadHalf, plateGap, plateHalfHeight } = g.capacitor;
      drawLeadsToPixi(graphics, leadHalf, plateGap + 1, strokeStyle);
      graphics
        .moveTo(-plateGap, -plateHalfHeight)
        .lineTo(-plateGap, plateHalfHeight)
        .moveTo(plateGap, -plateHalfHeight)
        .lineTo(plateGap, plateHalfHeight)
        .stroke(strokeStyle(0x111418, 4.6));
      break;
    }
    case 'battery': {
      const { leadInset, longPlateHalfHeight, shortPlateHalfHeight } = g.battery;
      drawLeadsToPixi(graphics, half, leadInset + 1, strokeStyle);
      graphics
        .moveTo(-leadInset, -longPlateHalfHeight)
        .lineTo(-leadInset, longPlateHalfHeight)
        .stroke(strokeStyle(0x111418, 4));
      graphics
        .moveTo(leadInset, -shortPlateHalfHeight)
        .lineTo(leadInset, shortPlateHalfHeight)
        .stroke(strokeStyle(0x111418, 2.2));
      break;
    }
    case 'diode':
    case 'zener':
    case 'led':
    case 'scr': {
      const { bodyHalf, triHalfHeight, barHalfHeight } = g[object.type === 'led' ? 'diode' : object.type];
      drawLeadsToPixi(graphics, half, bodyHalf, strokeStyle);
      graphics
        .moveTo(-bodyHalf, -triHalfHeight)
        .lineTo(bodyHalf, 0)
        .lineTo(-bodyHalf, triHalfHeight)
        .closePath()
        .stroke(strokeStyle());
      graphics.moveTo(bodyHalf, -barHalfHeight).lineTo(bodyHalf, barHalfHeight).stroke(strokeStyle());
      if (object.type === 'zener') {
        graphics.moveTo(bodyHalf, -barHalfHeight).lineTo(bodyHalf + 7, -barHalfHeight + 5)
          .moveTo(bodyHalf, barHalfHeight).lineTo(bodyHalf - 7, barHalfHeight - 5)
          .stroke(strokeStyle());
      }
      if (object.type === 'led') {
        drawIecArrowToPixi(graphics, -3, -29, -20, -44, strokeStyle);
        drawIecArrowToPixi(graphics, 12, -27, -5, -42, strokeStyle);
      }
      if (object.type === 'scr') {
        graphics.moveTo(-8, 28).lineTo(-8, 16).lineTo(6, 4).stroke(strokeStyle());
      }
      break;
    }
    case 'inductor': {
      const { leadHalf, innerLead, loopRadius, loopStep } = g.inductor;
      graphics.moveTo(-leadHalf, 0).lineTo(-innerLead, 0);
      for (let i = 0; i < 4; i += 1) graphics.arc(-innerLead + loopRadius + i * loopStep, 0, loopRadius, Math.PI, 0);
      graphics.lineTo(leadHalf, 0).stroke(strokeStyle());
      break;
    }
    case 'source': {
      const { leadHalf, innerLead, radius } = g.source;
      drawLeadsToPixi(graphics, leadHalf, innerLead, strokeStyle);
      graphics.circle(0, 0, radius).stroke(strokeStyle());
      graphics.moveTo(-7, -8).lineTo(7, -8).moveTo(0, -15).lineTo(0, -1).moveTo(-7, 9).lineTo(7, 9).stroke(strokeStyle());
      break;
    }
    case 'switch': {
      const { leadHalf, terminalOffset, armRise } = g.switch;
      graphics.moveTo(-leadHalf, 0).lineTo(-terminalOffset, 0).moveTo(terminalOffset, 0).lineTo(leadHalf, 0).moveTo(-terminalOffset, 0).lineTo(terminalOffset, -armRise).stroke(strokeStyle());
      graphics.circle(-terminalOffset, 0, 3).fill(0x111418);
      graphics.circle(terminalOffset, 0, 3).fill(0x111418);
      break;
    }
    case 'ground': {
      graphics.moveTo(0, -42).lineTo(0, 0).moveTo(-24, 0).lineTo(24, 0).moveTo(-16, 8).lineTo(16, 8).moveTo(-8, 16).lineTo(8, 16).stroke(strokeStyle());
      break;
    }
    case 'lamp': {
      const { leadHalf, innerLead, radius } = g.lamp;
      drawLeadsToPixi(graphics, leadHalf, innerLead, strokeStyle);
      graphics.circle(0, 0, radius).stroke(strokeStyle());
      graphics.moveTo(-16, -16).lineTo(16, 16).moveTo(16, -16).lineTo(-16, 16).stroke(strokeStyle());
      break;
    }
    default:
      break;
  }
}

export function svgMarkupForIecSymbol(object) {
  const half = normalizedSymbolLength(object) / 2;
  switch (object.type) {
    case 'resistor':
      return `<path d="M${-half} 0H-23M23 0H${half}"/><rect x="-23" y="-8" width="46" height="16" fill="none"/>`;
    case 'fuse':
      return `<path d="M${-half} 0H-14M14 0H${half}"/><rect x="-14" y="-6" width="28" height="12" fill="none"/>`;
    case 'capacitor':
      return `<path d="M-55 0H-13M13 0H55M-12 -18V18M12 -18V18"/>`;
    case 'battery':
      return `<path d="M${-half} 0H-15M15 0H${half}M-14 -26V26M14 -16V16"/>`;
    case 'diode':
      return `<path d="M${-half} 0H-22M22 0H${half}M-22 -21L22 0L-22 21ZM22 -23V23"/>`;
    case 'zener':
      return `<path d="M${-half} 0H-22M22 0H${half}M-22 -21L22 0L-22 21ZM22 -23V23M22 -23L29 -18M22 23L15 18"/>`;
    case 'led':
      return `<path d="M${-half} 0H-22M22 0H${half}M-22 -21L22 0L-22 21ZM22 -23V23M-3 -29L-20 -44M-20 -44L-13 -42M-20 -44L-18 -37M12 -27L-5 -42M-5 -42L2 -40M-5 -42L-3 -35"/>`;
    case 'scr':
      return `<path d="M${-half} 0H-22M22 0H${half}M-22 -21L22 0L-22 21ZM22 -23V23M-8 28V16L6 4"/>`;
    case 'inductor':
      return `<path d="M-60 0H-38M-28 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0H60"/>`;
    case 'source':
      return `<path d="M-60 0H-24M24 0H60M-7 -8H7M0 -15V-1M-7 9H7"/><circle cx="0" cy="0" r="24" fill="none"/>`;
    case 'switch':
      return `<path d="M-60 0H-18M18 0H60M-18 0L18 -22"/><circle cx="-18" cy="0" r="3"/><circle cx="18" cy="0" r="3"/>`;
    case 'ground':
      return `<path d="M0 -42V0M-24 0H24M-16 8H16M-8 16H8"/>`;
    case 'lamp':
      return `<path d="M-60 0H-24M24 0H60M-16 -16L16 16M16 -16L-16 16"/><circle cx="0" cy="0" r="24" fill="none"/>`;
    default:
      return '';
  }
}
