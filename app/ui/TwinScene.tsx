"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ExecutionTarget } from "./telemetry";

export function TwinScene({ failed, tick, target }: { failed: boolean; tick: number; target: ExecutionTarget }) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ failed, tick, target });
  useEffect(() => {
    state.current = { failed, tick, target };
  }, [failed, tick, target]);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050b13");
    scene.fog = new THREE.FogExp2("#050b13", .022);
    const camera = new THREE.PerspectiveCamera(45, 1, .1, 180);
    camera.position.set(26, 25, 31);
    camera.lookAt(0, 1, 0);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      mount.classList.add("scene-error");
      mount.textContent = "WebGL is unavailable. Telemetry and scheduler controls remain operational.";
      return () => {
        mount.classList.remove("scene-error");
        mount.textContent = "";
      };
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#70bde0", "#060b12", 1.6));
    const key = new THREE.DirectionalLight("#b8deff", 2.2);
    key.position.set(12, 24, 8);
    key.castShadow = true;
    scene.add(key);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(66, 56),
      new THREE.MeshStandardMaterial({ color: "#07111b", roughness: .84, metalness: .18 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(66, 44, "#163249", "#0c2132");
    grid.position.y = .015;
    scene.add(grid);

    const roadMat = new THREE.MeshStandardMaterial({ color: "#0d1824", roughness: .7 });
    const roadA = new THREE.Mesh(new THREE.BoxGeometry(66, .06, 6.2), roadMat);
    roadA.position.y = .04;
    scene.add(roadA);
    const roadB = roadA.clone();
    roadB.rotation.y = Math.PI / 2;
    scene.add(roadB);
    const stripeMat = new THREE.MeshBasicMaterial({ color: "#5b6c73" });
    for (let i = -30; i <= 30; i += 4) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, .02, .07), stripeMat);
      s.position.set(i, .09, 0);
      scene.add(s);
      const t = s.clone(); t.rotation.y = Math.PI / 2; t.position.set(0, .09, i); scene.add(t);
    }

    const buildingMat = new THREE.MeshStandardMaterial({ color: "#0d1c2a", roughness: .42, metalness: .36 });
    const windowMat = new THREE.MeshBasicMaterial({ color: "#2b6b82" });
    const footprints = [
      [-15,-13,6,6,8],[-7,-14,4,6,11],[8,-14,7,5,6],[17,-14,5,7,12],
      [-15,-5,6,4,5],[14,-4,7,4,8],[-16,8,5,7,13],[-8,11,5,5,7],[9,9,6,7,10],[18,8,5,5,6],
      [-18,18,7,5,7],[-8,19,5,4,10],[11,18,8,5,5],[21,18,4,5,9],
    ];
    footprints.forEach(([x,z,w,d,h], index) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), buildingMat);
      b.position.set(x,h/2,z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
      for (let level=1; level<h; level+=2.2) for (let wx=-w/2+1; wx<w/2; wx+=1.5) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(.45,.2), windowMat);
        win.position.set(x+wx,level,z+d/2+.011); scene.add(win);
      }
      if (index % 3 === 0) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w*.45,.25,d*.35), new THREE.MeshBasicMaterial({color:"#183a4c"}));
        roof.position.set(x,h+.14,z); scene.add(roof);
      }
    });

    const stations: { id:string; x:number; z:number; mast:THREE.Group; glow:THREE.Mesh; beams:THREE.Line[] }[] = [];
    [[-10,-1],[12,4],[2,-14]].forEach(([x,z], idx) => {
      const mast = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,6,8), new THREE.MeshStandardMaterial({ color:"#a5c8d8",metalness:.8 }));
      pole.position.y=3; mast.add(pole);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.55,.06,8,28), new THREE.MeshBasicMaterial({ color:"#56e8ff" }));
      ring.rotation.x=Math.PI/2; ring.position.y=5; mast.add(ring);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(7.5,2.2,7,48,1,true), new THREE.MeshBasicMaterial({color:"#2fcff4",transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false}));
      glow.position.y=3.5; mast.add(glow);
      mast.position.set(x,0,z); scene.add(mast);
      const beams:THREE.Line[]=[];
      for(let j=0;j<3;j++){
        const pts=[new THREE.Vector3(x,5,z),new THREE.Vector3(x+Math.cos(j*2.1)*8,.5,z+Math.sin(j*2.1)*8)];
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:"#56e8ff",transparent:true,opacity:.42}));
        scene.add(line);beams.push(line);
      }
      stations.push({id:`gNB-${idx}`,x,z,mast,glow,beams});
    });

    const edgeNode = new THREE.Mesh(new THREE.BoxGeometry(2.1,1.35,2.1),new THREE.MeshStandardMaterial({color:"#0c5969",emissive:"#0a3944",emissiveIntensity:.8,metalness:.55}));
    edgeNode.position.set(12,.72,4);scene.add(edgeNode);
    const westEdgeNode = edgeNode.clone();
    westEdgeNode.position.set(-10,.72,-1);scene.add(westEdgeNode);
    const regionalNode = new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.25,1.2,6),new THREE.MeshStandardMaterial({color:"#3d55a4",emissive:"#222d69",emissiveIntensity:.7,metalness:.5}));
    regionalNode.position.set(-20,.65,18);scene.add(regionalNode);
    const cloud = new THREE.Mesh(new THREE.OctahedronGeometry(1.25,1),new THREE.MeshStandardMaterial({color:"#3153a3",emissive:"#1d3472",emissiveIntensity:.8,wireframe:true}));
    cloud.position.set(19,9,-18);scene.add(cloud);

    const carMat = new THREE.MeshStandardMaterial({color:"#ffbd59",emissive:"#613b08",emissiveIntensity:.5});
    const cars:THREE.Mesh[]=[];
    for(let i=0;i<8;i++){
      const c=new THREE.Mesh(new THREE.BoxGeometry(1.2,.45,.7),i===0?carMat:new THREE.MeshStandardMaterial({color:i%2?"#5f8dbb":"#d65b6f"}));
      c.position.set(-26+i*6,.35,i%2?1.6:-1.6);c.castShadow=true;scene.add(c);cars.push(c);
    }
    const drone=new THREE.Group();
    const db=new THREE.Mesh(new THREE.SphereGeometry(.28,16,8),new THREE.MeshStandardMaterial({color:"#a9ed66",emissive:"#355d13",emissiveIntensity:.8}));drone.add(db);
    for(const x of [-.65,.65]) for(const z of [-.65,.65]) { const arm=new THREE.Mesh(new THREE.BoxGeometry(.8,.035,.035),new THREE.MeshBasicMaterial({color:"#76919c"}));arm.position.set(x/2,0,z/2);arm.rotation.y=(x*z>0?.78:-.78);drone.add(arm); }
    scene.add(drone);

    const phone = new THREE.Mesh(new THREE.BoxGeometry(.32,.08,.58),new THREE.MeshStandardMaterial({color:"#d8efff",emissive:"#23637d",emissiveIntensity:.7}));
    phone.position.set(-4.2,1.3,8.6);scene.add(phone);
    const networkCamera = new THREE.Group();
    const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(.7,.45,.5),new THREE.MeshStandardMaterial({color:"#8eb4c9",metalness:.55}));
    const cameraLens = new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,.22,16),new THREE.MeshBasicMaterial({color:"#56e8ff"}));
    cameraLens.rotation.x=Math.PI/2;cameraLens.position.z=.32;networkCamera.add(cameraBody,cameraLens);networkCamera.position.set(18,3.8,-8);scene.add(networkCamera);
    const robot = new THREE.Mesh(new THREE.BoxGeometry(.8,.7,.8),new THREE.MeshStandardMaterial({color:"#a9ed66",emissive:"#31501a",emissiveIntensity:.55}));
    robot.position.set(-13,.4,13.5);scene.add(robot);
    for (const [x,z] of [[8.2,17],[-20,-10],[19,14],[-6,-19]]) {
      const sensor = new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,.8,8),new THREE.MeshBasicMaterial({color:"#8a99ad"}));
      sensor.position.set(x,.4,z);scene.add(sensor);
    }

    const taskDot=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),new THREE.MeshBasicMaterial({color:"#ffffff"}));scene.add(taskDot);
    const routeLine = new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:"#7cf0ff",dashSize:.5,gapSize:.3,transparent:true,opacity:.75}));
    scene.add(routeLine);

    const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame=0, raf=0, dragging=false, prevX=0, yaw=0;
    const resize=()=>{const {clientWidth:w,clientHeight:h}=mount;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const ro=new ResizeObserver(resize);ro.observe(mount);resize();
    const onDown=(e:PointerEvent)=>{dragging=true;prevX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId)};
    const onMove=(e:PointerEvent)=>{if(dragging){yaw+=(e.clientX-prevX)*.006;prevX=e.clientX}};
    const onUp=()=>{dragging=false};
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
        e.preventDefault();
        yaw+=e.key==="ArrowLeft"?-.12:.12;
      }
    };
    renderer.domElement.addEventListener("pointerdown",onDown);renderer.domElement.addEventListener("pointermove",onMove);renderer.domElement.addEventListener("pointerup",onUp);
    renderer.domElement.addEventListener("pointercancel",onUp);mount.addEventListener("keydown",onKey);
    const animate=()=>{
      frame+=reducedMotion?0:.012;
      const cfg=state.current;
      const outage=cfg.failed;
      const centralCoverage=stations[1].glow.material as THREE.MeshBasicMaterial;
      centralCoverage.color.set(outage?"#ff455f":"#2fcff4");
      centralCoverage.opacity=outage?.025:.07;
      stations[1].beams.forEach((b)=>{(b.material as THREE.LineBasicMaterial).color.set(outage?"#ff455f":"#56e8ff");(b.material as THREE.LineBasicMaterial).opacity=outage?.11:.42;});
      stations[1].mast.visible=!outage || Math.sin(frame*12)>-.55;
      cars.forEach((c,i)=>{c.position.x=((frame*3.8+i*7+32)%64)-32;c.position.z=i%2?1.7:-1.7;});
      drone.position.set(Math.cos(frame*.7)*13,6+Math.sin(frame*1.4)*1.2,Math.sin(frame*.7)*10);
      drone.rotation.y=frame;
      robot.position.x=-13+((frame*1.1)%12);
      const start=cars[0].position.clone();
      const dest=cfg.target==="edge"
        ? (outage?westEdgeNode:edgeNode).position.clone()
        :cfg.target==="regional_edge"
          ?regionalNode.position.clone()
          :cfg.target==="cloud"
            ?cloud.position.clone()
            :start.clone().add(new THREE.Vector3(0,1.2,0));
      const ctrl=start.clone().lerp(dest,.5).add(new THREE.Vector3(0,5,0));
      const curve=new THREE.QuadraticBezierCurve3(start,ctrl,dest);
      routeLine.geometry.dispose();routeLine.geometry=new THREE.BufferGeometry().setFromPoints(curve.getPoints(34));routeLine.computeLineDistances();
      taskDot.position.copy(curve.getPoint((frame*.34)%1));
      taskDot.scale.setScalar(1+Math.sin(frame*9)*.22);
      cloud.rotation.y+=.007;
      const r=39;camera.position.x=Math.sin(yaw+.72)*r;camera.position.z=Math.cos(yaw+.72)*r;camera.lookAt(0,1,0);
      renderer.render(scene,camera);raf=requestAnimationFrame(animate);
    }; animate();
    return()=>{
      cancelAnimationFrame(raf);ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown",onDown);
      renderer.domElement.removeEventListener("pointermove",onMove);
      renderer.domElement.removeEventListener("pointerup",onUp);
      renderer.domElement.removeEventListener("pointercancel",onUp);
      mount.removeEventListener("keydown",onKey);
      scene.traverse((object)=>{
        const mesh=object as THREE.Mesh;
        mesh.geometry?.dispose();
        if(Array.isArray(mesh.material)) mesh.material.forEach((material)=>material.dispose());
        else mesh.material?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if(renderer.domElement.parentNode===mount) mount.removeChild(renderer.domElement);
    };
  },[]);

  return <div ref={host} className="scene" role="application" tabIndex={0} aria-label="Interactive 3D city digital twin. Drag, swipe, or use left and right arrow keys to rotate the view." />;
}
