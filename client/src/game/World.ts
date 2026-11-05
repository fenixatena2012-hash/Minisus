import Phaser from "phaser";
export class World extends Phaser.Scene {
  constructor(){ super("world"); }
  create(){
    const g=this.add.graphics();
    g.fillStyle(0x182437,1); g.fillRoundedRect(20,20,340,500,28);
    g.lineStyle(3,0x2f4964,1); g.strokeRoundedRect(20,20,340,500,28);
    for(let i=0;i<9;i++){ const x=55+(i%3)*130, y=100+Math.floor(i/3)*130; g.fillStyle(0x29445a,1); g.fillRoundedRect(x,y,75,55,12); }
    const player=this.add.circle(190,360,17,0x48d9e8).setStrokeStyle(3,0xffffff);
    this.input.on("pointerdown",(p:Phaser.Input.Pointer)=>{ this.tweens.add({targets:player,x:Phaser.Math.Clamp(p.x,40,340),y:Phaser.Math.Clamp(p.y,40,500),duration:250}); });
    this.add.text(190,50,"ARENA MINI SUS",{fontFamily:"Arial",fontSize:"18px",color:"#ffffff"}).setOrigin(.5);
  }
}
