/* Raster effects generated locally in ComfyUI, exported as transparent pixel atlases. */
(() => {
  'use strict';
  const names=['bolt','charged-bolt','slash','charge','impact','ultimate','dash','boss-breath','boss-claw','boss-charge','boss-overdrive','boss-quake'];
  const assets=Object.fromEntries(names.map(name=>[name,{image:new Image(),file:`assets/fx-${name}.png`,width:1536,height:192,loaded:false}]));
  assets.cutin={image:new Image(),file:'assets/punkman-ultimate-cutin.png',width:512,height:256,loaded:false};
  assets.bossCutin={image:new Image(),file:'assets/boss-phase2-cutin.png',width:512,height:256,loaded:false};
  const ready=()=>Object.values(assets).every(a=>a.loaded);
  function load(onReady,onError){
    for(const a of Object.values(assets))a.loaded=false;
    for(const a of Object.values(assets)){
      a.image.onload=()=>{if(a.image.naturalWidth!==a.width||a.image.naturalHeight!==a.height){a.image.onerror();return;}a.loaded=true;if(ready())onReady();};
      a.image.onerror=()=>{a.loaded=false;onError();};a.image.src=a.file;
    }
  }
  function draw(ctx,name,x,y,w,h,frame=0,face=1,alpha=1){
    const a=assets[name];if(!a?.loaded||alpha<=0)return;
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(face,1);
    ctx.globalAlpha=alpha;ctx.globalCompositeOperation='screen';
    ctx.drawImage(a.image,Math.max(0,Math.min(7,Math.floor(frame)))*192,0,192,192,-w/2,-h/2,w,h);ctx.restore();
  }
  function cutin(ctx,x,y,w,h,alpha=1,name='cutin'){if(!assets[name]?.loaded)return;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(assets[name].image,x,y,w,h);ctx.restore();}
  window.PunkmanFX={load,ready,draw,cutin};
})();
