'use client';
/* oxlint-disable next/no-img-element -- Bundled offline tile artwork. */
export function tileName(tile:string) {
  if(tile.endsWith('z'))return ['东','南','西','北','白','发','中'][Number(tile[0])-1] || tile;
  return (tile[0]==='0'?'赤五':tile[0])+({m:'万',p:'筒',s:'索'}[tile.slice(-1)]||'');
}
export function MahjongTile({tile}:{tile:string}) {
  return <img className="mahjong-art" src={`/tiles/${tile}.png`} alt={tileName(tile)} draggable={false}/>;
}
export function HandDisplay({tiles}:{tiles:string[]}) {
  return <div className="visual-hand">{tiles.map((tile,i)=><MahjongTile key={i} tile={tile}/>)}</div>;
}
