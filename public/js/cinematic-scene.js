import * as THREE from '../vendor/three/three.module.min.js';
import { createMessageCanvas, createStudioCanvas, createGlowCanvas, createProcessingCanvas, createProductCanvas, createBookingCanvas, preloadProductImages } from './cinematic-textures.js';

/* Original beveled interface objects. There are no product-model placeholders,
   application API calls, remote textures, autoplay media or device sensors. */
export async function createScene(canvas, options) {
  const platformImage = await new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject;
    image.src = '/assets/cinematic/platform-demo.png';
  });
  if (options.isCancelled?.()) throw new DOMException('Scene left before initialization', 'AbortError');
  const coarse = options.coarse;
  let disposed = false, visible = true, frame = 0, lastPaint = 0, resuming = true;
  let width = options.width, height = options.height;
  let target = 0, progress = 0, pointerX = 0, pointerY = 0, aimX = 0, aimY = 0;
  let entrance = 0, slowFrames = 0, adaptiveRatio;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', stencil: false, depth: true });
  const pixelRatio = adaptiveRatio = Math.min(devicePixelRatio || 1, coarse ? 1.25 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.setClearColor(0x050605, 0);
  canvas.dataset.engine = 'three-r180';
  canvas.dataset.pixelRatio = String(pixelRatio);
  canvas.dataset.quality = coarse ? 'balanced' : 'high';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(coarse ? 46 : 39, width / height, .1, 90);
  const assembly = new THREE.Group(); scene.add(assembly);
  const textures = new Set();
  const texture = surface => {
    const map = new THREE.CanvasTexture(surface);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.add(map); return map;
  };
  const environment = texture(createStudioCanvas());
  environment.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromEquirectangular(environment);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .85;
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(0xb9c6ae, .72));
  const key = new THREE.DirectionalLight(0xf4ffe8, 3.1); key.position.set(-4, 6, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbaff32, 4.2); rim.position.set(3, 1, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x627b4c, 1.25); fill.position.set(-6, -1, 2); scene.add(fill);
  const glowLight = new THREE.PointLight(0xbaff34, 25, 16, 2); glowLight.position.set(0, -2, 3); scene.add(glowLight);

  const graphite = new THREE.MeshStandardMaterial({ color: 0x10130f, roughness: .29, metalness: .82, envMapIntensity: 1.6 });
  const edgeMetal = new THREE.MeshStandardMaterial({ color: 0x718061, roughness: .23, metalness: .94, envMapIntensity: 2.2 });
  const innerMetal = new THREE.MeshStandardMaterial({ color: 0x1f2b10, roughness: .34, metalness: .82, envMapIntensity: 1.7 });
  const luminous = new THREE.MeshStandardMaterial({ color: 0x789e23, emissive: 0x8cbe1c, emissiveIntensity: .58, roughness: .4, metalness: .25 });

  function rounded(w, h, r) {
    const x = -w / 2, y = -h / 2, shape = new THREE.Shape();
    shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y); return shape;
  }

  function slab(w, h, depth, radius, material, bevel = .025) {
    const geometry = new THREE.ExtrudeGeometry(rounded(w, h, radius), { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 8 });
    geometry.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geometry, material);
  }

  function face(w, h, radius, map) {
    const geometry = new THREE.ShapeGeometry(rounded(w, h, radius), 12);
    const pos = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    const material = new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.FrontSide });
    return new THREE.Mesh(geometry, material);
  }

  function panel(w, h, map, thickness = .14, radius = .14) {
    const group = new THREE.Group();
    const back = slab(w + .1, h + .1, thickness, radius + .03, graphite, .035); group.add(back);
    const bevel = slab(w + .035, h + .035, .026, radius, edgeMetal, .012); bevel.position.z = thickness / 2 + .024; group.add(bevel);
    const channel = slab(w - .005, h - .005, .018, radius, luminous, .006); channel.position.z = thickness / 2 + .042; group.add(channel);
    const inset = slab(w - .035, h - .035, .026, radius, innerMetal, .009); inset.position.z = thickness / 2 + .055; group.add(inset);
    const screen = face(w - .095, h - .095, radius - .015, map); screen.position.z = thickness / 2 + .08; group.add(screen);
    // Fine physical fasteners and engraved edge marks make thickness legible.
    const screwGeo = new THREE.CylinderGeometry(.021, .021, .008, 10);
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x7d8d69, metalness: .9, roughness: .32 });
    const screws = new THREE.InstancedMesh(screwGeo, screwMat, 4), screwTransform = new THREE.Object3D();
    let screwIndex = 0;
    for (const side of [-1, 1]) {
      for (const row of [-1, 1]) {
        screwTransform.rotation.x = Math.PI / 2;
        screwTransform.position.set(side * (w / 2 - .045), row * (h / 2 - .045), thickness / 2 + .012); screwTransform.updateMatrix();
        screws.setMatrixAt(screwIndex++, screwTransform.matrix);
      }
    }
    group.add(screws);
    return group;
  }

  const platformTexture = new THREE.Texture(platformImage); platformTexture.needsUpdate = true;
  platformTexture.colorSpace = THREE.SRGBColorSpace;
  platformTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); textures.add(platformTexture);
  const board = panel(7.8, 5.96, platformTexture, .24, .17); assembly.add(board);
  const rails = new THREE.Group(); board.add(rails);
  const railGeo = new THREE.CylinderGeometry(.014, .014, 6.6, 8);
  const rail = new THREE.Mesh(railGeo, luminous); rail.rotation.z = Math.PI / 2; rail.position.set(0, -3.05, -.06); rails.add(rail);
  const pins = new THREE.Group(); board.add(pins);
  const pinGeometry = new THREE.CylinderGeometry(.014, .014, .18, 6);
  const darkPins = new THREE.InstancedMesh(pinGeometry, edgeMetal, 17), brightPins = new THREE.InstancedMesh(pinGeometry, luminous, 6);
  const pinTransform = new THREE.Object3D(); let darkIndex = 0, brightIndex = 0;
  for (let i = 0; i < 23; i++) {
    pinTransform.rotation.x = Math.PI / 2; pinTransform.position.set(-3.15 + i * .285, -2.89, -.2); pinTransform.updateMatrix();
    if (i % 4 === 0) brightPins.setMatrixAt(brightIndex++, pinTransform.matrix); else darkPins.setMatrixAt(darkIndex++, pinTransform.matrix);
  }
  pins.add(darkPins, brightPins);

  const cards = [
    { kind: 'incoming', from: [-.3, .2, 3.1], to: [-4.2, 1.8, 1.1], rotation: [.03, .1, -.05], scale: 1 },
    { kind: 'reply', from: [.25, -.35, 2.5], to: [3.8, -.9, 1.5], rotation: [.04, -.14, .055], scale: .95 },
    { kind: 'knowledge', from: [.1, .2, .5], to: [3.5, 2.5, -.3], rotation: [-.03, -.14, .035], scale: .76 },
    { kind: 'handoff', from: [-.6, -.5, 1.5], to: [-3.4, -2.6, .5], rotation: [.08, .1, -.035], scale: .82 }
  ].map(spec => {
    const object = panel(3.15, 1.84, texture(createMessageCanvas(spec.kind)), .14, .13);
    object.scale.setScalar(spec.scale); assembly.add(object); return { ...spec, object };
  });

  // A sculpted brand mark, not an unrelated gadget.
  const markShape = new THREE.Shape();
  markShape.moveTo(-.42, .05); markShape.lineTo(.42, .42); markShape.lineTo(.05, -.42); markShape.lineTo(-.08, -.03); markShape.closePath();
  const mark = new THREE.Mesh(new THREE.ExtrudeGeometry(markShape, { depth: .09, bevelEnabled: true, bevelSegments: 3, bevelSize: .018, bevelThickness: .015, steps: 1 }), luminous);
  mark.position.set(0, 3.48, .1); mark.rotation.set(.12, -.2, -.08); assembly.add(mark);
  const traceMaterial = new THREE.MeshBasicMaterial({ color: 0xb3e83c, transparent: true, opacity: .32 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(.72, .005, 5, 80), traceMaterial);
  halo.position.set(0, 3.45, -.12); halo.rotation.set(.2, .12, 0); assembly.add(halo);

  const traces = new THREE.Group(); traces.position.z = -.95; assembly.add(traces);
  for (let i = 0; i < 3; i++) {
    const direction = i % 2 ? -1 : 1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(direction * 3.1, 1.5 - i * 1.3, -.18),
      new THREE.Vector3(direction * 4.4, 2 - i * 1.55, -.3),
      new THREE.Vector3(direction * 4.6, -.7 - i * .5, .1),
      new THREE.Vector3(direction * 2.8, -2.5, .1)
    ]);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .008, 5, false), traceMaterial); traces.add(wire);
  }

  const glowMap = texture(createGlowCanvas());
  const groundGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xb4f23e, transparent: true, opacity: .24, depthWrite: false, blending: THREE.AdditiveBlending }));
  groundGlow.position.set(0, -3.6, -1); groundGlow.scale.set(13, 4.5, 1); scene.add(groundGlow);
  const edgeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xc4ff41, transparent: true, opacity: .07, depthWrite: false, blending: THREE.AdditiveBlending }));
  edgeGlow.scale.set(12, 10, 1); edgeGlow.position.set(0, 0, -2); scene.add(edgeGlow);

  const ease = (a, b, value) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t);
  };
  const desired = new THREE.Vector3(), look = new THREE.Vector3();
  function composeOpening(p) {
    const mobile = width < 900;
    const arrival = 1 - Math.pow(1 - entrance, 3);
    const unfold = ease(.07, .76, p), wide = ease(.12, .95, p), approach = ease(0, .28, p);
    const turn = Math.sin(p * Math.PI);
    assembly.position.set(mobile ? 0 : -3 + wide * 1.6, (mobile ? -2.35 + wide * 4.3 : -.2 + wide * .15) - (1 - arrival) * .16, 0);
    assembly.scale.setScalar((mobile ? .64 - wide * .18 : .9) * (.97 + arrival * .03));
    assembly.rotation.set(-.1 + turn * .08 + aimY * .022, -.24 + wide * .38 + aimX * .04 - (1 - arrival) * .065, -.055 + wide * .07);
    board.position.z = -.75 + unfold * .25;
    board.rotation.set(-.015, .025, -.008);
    cards.forEach((spec, i) => {
      const local = ease(.035 + i * .035, .69 + i * .035, p);
      spec.object.position.set(
        THREE.MathUtils.lerp(spec.from[0], spec.to[0], local),
        THREE.MathUtils.lerp(spec.from[1], spec.to[1], local) + Math.sin(p * Math.PI * 2 + i) * .09,
        THREE.MathUtils.lerp(spec.from[2], spec.to[2], local)
      );
      spec.object.rotation.set(spec.rotation[0] + (1 - local) * .1, spec.rotation[1] + (1 - local) * (i % 2 ? -.14 : .14), spec.rotation[2] + (1 - local) * (i % 2 ? .075 : -.075));
    });
    traces.scale.setScalar(.82 + unfold * .18);
    mark.rotation.y = -.2 + wide * .42;
    mark.rotation.z = -.08 - (1 - arrival) * .35;
    mark.scale.setScalar(.75 + arrival * .25);
    halo.rotation.y = .12 + wide * .4;
    glowLight.intensity = 18 + unfold * 9;
    if (mobile) {
      desired.set(.35 - turn * .5 + aimX * .12, .25 + wide * .65 + aimY * .08, 9.5 + wide * 3.8 - Math.sin(Math.min(1,p/.3)*Math.PI)*.55);
      look.set(0, -.1 + wide * .25, .15);
    } else {
      desired.set(.5 - turn * 1.3 + aimX * .24, .65 + wide * .9 + aimY * .15, 10.8 + wide * 4 - Math.sin(Math.min(1,p/.3)*Math.PI)*1.1);
      look.set(-.8 + wide * .4, .15 + wide * .25, .15);
    }
    // A measured oblique move exposes bevels, then opens to the complete platform.
    camera.position.copy(desired); camera.lookAt(look);
    camera.updateMatrixWorld();
    canvas.dataset.camera = [camera.position.x, camera.position.y, camera.position.z].map(v => v.toFixed(3)).join(',');
    canvas.dataset.progress = p.toFixed(4);
    canvas.dataset.triangles = String(renderer.info.render.triangles);
    canvas.dataset.objects = String(renderer.info.render.calls);
  }

  // Additional geometry is created only as its chapter approaches. One renderer,
  // camera and context serve all four chapters, and only visible groups draw.
  const storeWorld = new THREE.Group(); storeWorld.visible = false; scene.add(storeWorld);
  let processing = null, processLinks = [], processMaps = [], products = [], booking = null, storeReady = false, storeLoading = false;

  function ensureConversations() {
    if (processing || disposed) return;
    processMaps = [0, 1, 2].map(step => texture(createProcessingCanvas(step)));
    processing = panel(5.9, 1.45, processMaps[0], .12, .12);
    processing.visible = false; assembly.add(processing);
    const points = [
      [[-2.1, 1.5, .8], [-1.7, .75, .3], [-1.2, .3, .15]],
      [[-1.1, -.3, .15], [0, -.85, .15], [1.2, -.35, .2]],
      [[1.3, -.35, .2], [2.2, -.2, .6], [2.3, -.6, .8]]
    ];
    processLinks = points.map((path, index) => {
      const curve = new THREE.CatmullRomCurve3(path.map(point => new THREE.Vector3(...point)));
      const material = new THREE.MeshBasicMaterial({ color: 0xc4ff41, transparent: true, opacity: .6 });
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, .014, 5, false), material);
      line.visible = false; assembly.add(line); return line;
    });
  }

  async function ensureStore() {
    if (storeReady || storeLoading || disposed) return;
    storeLoading = true;
    try { await preloadProductImages(); } catch { /* Detailed local vector fallback. */ }
    if (disposed) return;
    products = ['bag', 'vase', 'perfume'].map(kind => {
      const object = panel(2.55, 3.2, texture(createProductCanvas(kind)), .14, .14);
      storeWorld.add(object); return object;
    });
    booking = panel(4.3, 2.78, texture(createBookingCanvas()), .14, .14); storeWorld.add(booking);
    storeReady = true; storeLoading = false; canvas.dataset.productsReady = 'true'; wake();
  }

  const movingNodes = [assembly, board, mark, halo, ...cards.map(card => card.object)];
  function snapshot() {
    return { nodes: movingNodes.map(node => ({ position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone() })), camera: camera.position.clone(), look: look.clone() };
  }
  function blendFrom(before, amount) {
    movingNodes.forEach((node, index) => {
      const from = before.nodes[index];
      node.position.lerpVectors(from.position, node.position.clone(), amount);
      node.quaternion.slerpQuaternions(from.rotation, node.quaternion.clone(), amount);
      node.scale.lerpVectors(from.scale, node.scale.clone(), amount);
    });
    camera.position.lerpVectors(before.camera, camera.position.clone(), amount);
    look.lerpVectors(before.look, look.clone(), amount); camera.lookAt(look);
  }
  function resetOpening() {
    assembly.visible = true; board.visible = true; storeWorld.visible = false;
    board.position.set(0, 0, 0); board.scale.setScalar(1);
    mark.position.set(0, 3.48, .1); mark.scale.setScalar(1);
    cards.forEach(card => { card.object.visible = true; card.object.scale.setScalar(card.scale); });
    traces.visible = true; halo.position.set(0, 3.45, -.12); halo.scale.setScalar(1); halo.rotation.set(.2, .12, 0);
    if (processing) processing.visible = false;
    processLinks.forEach(line => { line.visible = false; });
  }
  function conversationsPose(t) {
    const mobile = width < 900;
    assembly.position.set(mobile ? 0 : -2.7, mobile ? 1.8 : .15, 0);
    assembly.scale.setScalar(mobile ? .59 : .88);
    assembly.rotation.set(.025 + aimY * .02, -.08 + Math.sin(t * Math.PI) * .16 + aimX * .035, .012);
    const retreat = 1 - ease(.12, .42, t);
    board.position.set(0, .1, -3.3); board.scale.setScalar(Math.max(.001, .58 * retreat)); board.rotation.set(-.08, .6, .04);
    const positions = [[-2.15, 1.55, .8], [2.25, -.7, .8], [2.6, 2.4, -.7], [-2.25, -1.65, -.45]];
    cards.forEach((card, i) => {
      const pos = positions[i], float = Math.sin(t * Math.PI * 1.8 + i) * .12;
      card.object.position.set(pos[0], pos[1] + float, pos[2] + Math.sin(t * Math.PI + i) * .12);
      card.object.rotation.set(.025, (i % 2 ? -.1 : .12) + Math.sin(t * Math.PI) * .04, (i % 2 ? .035 : -.035));
      card.object.scale.setScalar([1.03, 1, .69, .74][i]);
    });
    mark.position.set(0, 3.1, -.4); mark.scale.setScalar(.62); mark.rotation.set(.12, t * .5, -.08);
    halo.position.set(0, 3.1, -.5); halo.scale.setScalar(.7);
    traces.visible = false;
    if (processing) {
      processing.visible = true; processing.position.set(0, -.18, .1); processing.rotation.set(0, 0, 0);
      processing.scale.setScalar(ease(0, .2, t));
      processing.children[4].material.map = processMaps[Math.min(2, Math.floor(t * 3))];
    }
    processLinks.forEach((line, i) => {
      line.visible = true;
      line.geometry.setDrawRange(0, Math.floor(line.geometry.index.count * ease(i * .22, .28 + i * .24, t) / 3) * 3);
    });
    const pan = mobile ? THREE.MathUtils.lerp(-.6, .6, ease(.2, .85, t)) : -.6;
    camera.position.set(pan + Math.sin(t * Math.PI) * -.25 + aimX * .14, .55 + aimY * .08, mobile ? 9.35 : 11.5);
    look.set(pan, mobile ? .55 : .1, .1); camera.lookAt(look);
  }
  function composeConversations(t) {
    composeOpening(1); const before = snapshot();
    conversationsPose(t); blendFrom(before, ease(0, .2, t));
  }
  function storePose(t) {
    const mobile = width < 900;
    const settle = ease(.05, .75, t), arrival = ease(0, .19, t);
    storeWorld.visible = storeReady;
    storeWorld.position.set(mobile ? 0 : -2.8, mobile ? 1.9 : .1, 0);
    storeWorld.scale.setScalar((mobile ? .49 : .8) * Math.max(.001, arrival));
    storeWorld.rotation.set(-.02 + aimY * .02, -.18 + settle * .28 + aimX * .035, -.02 + settle * .025);
    products.forEach((object, i) => {
      const x = (i - 1) * (mobile ? 2.8 : 2.8);
      object.position.set(x * (1.45 - settle * .45), .45 + (i === 1 ? .4 : -.1) + Math.sin(t * Math.PI + i) * .07, (i === 1 ? .9 : -.3) + (1 - settle) * (i - 1));
      object.rotation.set(.03, (1 - settle) * (i - 1) * -.4, (1 - settle) * (i - 1) * -.13);
      object.scale.setScalar(mobile && i === 1 ? 1.08 : 1);
    });
    if (booking) {
      const show = ease(.32, .72, t);
      booking.position.set(.55 - show * .55, -2.4 + show * .7 + (mobile ? 1.05 : 0), 1.5 + show * .3);
      booking.rotation.set(-.12 + show * .12, .25 - show * .2, -.08 + show * .08);
      booking.scale.setScalar(Math.max(.001, show * (mobile ? 1.05 : .94)));
    }
    camera.position.set((mobile ? 0 : -.6) + Math.sin(t * Math.PI) * .6 + aimX * .15, .8 + aimY * .08, mobile ? 9.7 : 11.7);
    look.set(mobile ? 0 : -.55, mobile ? .6 : .1, .05); camera.lookAt(look);
  }
  function composeStore(t) {
    conversationsPose(1);
    const beforeCamera = camera.position.clone(), beforeLook = look.clone();
    const transition = ease(0, .18, t);
    assembly.scale.multiplyScalar(Math.max(.001, 1 - transition));
    assembly.position.z -= transition * 2;
    if (transition >= .999) assembly.visible = false;
    storePose(t);
    camera.position.lerpVectors(beforeCamera, camera.position.clone(), transition);
    look.lerpVectors(beforeLook, look.clone(), transition); camera.lookAt(look);
  }
  function composeConnected(t) {
    const mobile = width < 900, reveal = ease(0, .5, t);
    composeOpening(1);
    assembly.position.set(mobile ? 0 : -2.45, mobile ? 1.8 : .1, 0);
    assembly.scale.setScalar((mobile ? .43 : .8) * (.001 + reveal * .999));
    assembly.rotation.set(-.025 + aimY * .012, -.2 * (1 - reveal) + aimX * .02, -.02 * (1 - reveal));
    board.position.set(0, 0, -.2 * (1 - reveal)); board.rotation.set(0, 0, 0); board.scale.setScalar(.82 + reveal * .18);
    const destinations = [[-2.3, 1.1, .3], [1.9, -.4, .3], [2, 1.8, .3], [-2.2, -1.7, .3]];
    cards.forEach((card, i) => {
      const merge = ease(.15 + i * .025, .7 + i * .025, t), dest = destinations[i];
      card.object.position.set(THREE.MathUtils.lerp(card.to[0], dest[0], merge), THREE.MathUtils.lerp(card.to[1], dest[1], merge), THREE.MathUtils.lerp(card.to[2] + 1, dest[2], merge));
      card.object.rotation.set(0, card.rotation[1] * (1 - merge), card.rotation[2] * (1 - merge));
      card.object.scale.setScalar(card.scale * Math.max(.001, 1 - merge));
    });
    mark.position.set(0, 3.4, .1); mark.scale.setScalar(.7); halo.position.set(0, 3.4, -.1); halo.scale.setScalar(.75);
    traces.visible = false;
    storePose(1);
    const shrink = 1 - ease(0, .55, t);
    storeWorld.scale.multiplyScalar(Math.max(.001, shrink)); storeWorld.position.z += (1 - shrink) * .8;
    if (shrink <= .001) storeWorld.visible = false;
    camera.position.set(THREE.MathUtils.lerp(mobile ? 0 : -.6, mobile ? 0 : -.55, reveal), THREE.MathUtils.lerp(.8, mobile ? .6 : .7, reveal), THREE.MathUtils.lerp(mobile ? 9.7 : 11.7, mobile ? 9.3 : 12.2, reveal));
    look.set(THREE.MathUtils.lerp(mobile ? 0 : -.55, mobile ? 0 : -.4, reveal), THREE.MathUtils.lerp(mobile ? .6 : .1, mobile ? .55 : .15, reveal), .05 * (1 - reveal)); camera.lookAt(look);
  }

  function compose(p) {
    const chapter = Math.min(3, Math.floor(p * 4)), local = p === 1 ? 1 : p * 4 - chapter;
    resetOpening();
    if (p > .23) ensureConversations();
    if (p > .4) ensureStore();
    if (chapter === 0) composeOpening(local);
    else if (chapter === 1) composeConversations(local);
    else if (chapter === 2) composeStore(local);
    else composeConnected(local);
    camera.updateMatrixWorld();
    canvas.dataset.chapter = String(chapter);
    canvas.dataset.localProgress = local.toFixed(4);
    canvas.dataset.progress = p.toFixed(4);
    canvas.dataset.camera = [camera.position.x, camera.position.y, camera.position.z].map(v => v.toFixed(3)).join(',');
  }

  const birth = performance.now();
  function draw(now) {
    frame = 0;
    if (disposed || !visible || document.hidden || !canvas.isConnected) return;
    const interval = coarse ? 1000 / 30 : 1000 / 60;
    if (now - lastPaint < interval - 1) { frame = requestAnimationFrame(draw); return; }
    const delta = lastPaint ? Math.min(240, now - lastPaint) : 33;
    // Demand rendering can sleep for seconds. Its first resumed frame is not a
    // slow GPU frame; adapt quality only from gaps inside a continuing burst.
    if (!resuming) {
      if (lastPaint && now - lastPaint > 110) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    }
    resuming = false;
    if (slowFrames > 8 && adaptiveRatio > .85) {
      adaptiveRatio = Math.max(.85, adaptiveRatio * .8); renderer.setPixelRatio(adaptiveRatio); renderer.setSize(width, height, false);
      canvas.dataset.pixelRatio = adaptiveRatio.toFixed(2); canvas.dataset.quality = 'adaptive'; slowFrames = 0;
    }
    lastPaint = now;
    entrance = Math.min(1, (now - birth) / 1100);
    progress += (target - progress) * (1 - Math.exp(-delta / 125));
    aimX += (pointerX - aimX) * (1 - Math.exp(-delta / 180)); aimY += (pointerY - aimY) * (1 - Math.exp(-delta / 180));
    compose(progress);
    renderer.render(scene, camera);
    if (entrance < 1 || Math.abs(target - progress) > .00015 || Math.abs(pointerX - aimX) > .001 || Math.abs(pointerY - aimY) > .001) frame = requestAnimationFrame(draw);
  }
  function wake() {
    if (!disposed && visible && !frame && !document.hidden) {
      resuming = true;
      frame = requestAnimationFrame(draw);
    }
  }
  const lost = event => { event.preventDefault(); if (!disposed) options.onUnavailable?.(); };
  canvas.addEventListener('webglcontextlost', lost);
  const api = {
    setProgress(value) { target = Math.max(0, Math.min(1, value)); wake(); },
    setPointer(x, y) { pointerX = Math.max(-1, Math.min(1, x)); pointerY = Math.max(-1, Math.min(1, y)); wake(); },
    setVisible(value) { visible = value; if (value) wake(); else { cancelAnimationFrame(frame); frame = 0; } },
    resize(w, h) {
      if (disposed || !w || !h) return;
      width = w; height = h; camera.aspect = w / h; camera.fov = w < 900 ? 46 : 39;
      camera.updateProjectionMatrix(); renderer.setSize(w, h, false); wake();
    },
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(frame); frame = 0;
      canvas.removeEventListener('webglcontextlost', lost);
      const geometries = new Set(), materials = new Set();
      scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m)); });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(map => map.dispose());
      environmentTarget.dispose(); renderer.dispose(); renderer.forceContextLoss();
      canvas.width = 1; canvas.height = 1; canvas.dataset.disposed = 'true';
    }
  };
  compose(0); renderer.render(scene, camera); wake();
  return api;
}
