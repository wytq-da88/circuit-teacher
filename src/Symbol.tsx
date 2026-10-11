import type {ComponentType} from '../shared/types';
export const componentNames:Record<ComponentType,string>={battery:'电源',switch:'开关',resistor:'电阻',rheostat:'滑动变阻器',lamp:'小灯泡',ammeter:'电流表',voltmeter:'电压表'};
export function Symbol({type,closed=false,size=88}:{type:ComponentType;closed?:boolean;size?:number}) {
 return <svg width={size} height={size*.65} viewBox="0 0 100 64" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
 {type==='battery'?<><path d="M3 32H42M58 32H97M42 10V54M58 21V43"/><path d="M30 14H36M33 11V17" strokeWidth="1.6"/></>:
 type==='switch'?<><path d="M3 32H24M76 32H97"/><circle cx="26" cy="32" r="3"/><circle cx="74" cy="32" r="3"/><path d={closed?'M29 32H71':'M29 30L70 10'}/></>:
 type==='resistor'||type==='rheostat'?<><path d="M3 32H23M77 32H97"/><rect x="23" y="21" width="54" height="22"/>{type==='rheostat'&&<><path d="M50 3V27M44 21L50 27L56 21"/></>}</>:
 <><path d="M3 32H28M72 32H97"/><circle cx="50" cy="32" r="22"/>{type==='lamp'?<path d="M35 17L65 47M65 17L35 47"/>:<text x="50" y="39" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Arial,sans-serif" fontSize="23">{type==='ammeter'?'A':'V'}</text>}</>}
 </g></svg>;
}
