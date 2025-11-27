import Stats from "stats.js";
import GUI from "lil-gui";
import {
    BasicMaterial,
    BoxGeometry,
    Mesh,
    PerspectiveCamera,
    Renderer,
    Scene,
} from "../src";
import { Vector3 } from "../src/math";

const canvas = document.getElementById("gfx-canvas") as HTMLCanvasElement;

const renderer = new Renderer(canvas);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.resize();
renderer.debug = true;

const scene = new Scene();

// Create two different materials
const orangeMaterial = new BasicMaterial({ color: new Vector3(1.0, 0.5, 0.2) });
const purpleMaterial = new BasicMaterial({ color: new Vector3(0.6, 0.2, 0.9) });

const boxGeometry = new BoxGeometry({
    width: 1,
    height: 1,
    depth: 1,
});
const box = new Mesh(boxGeometry, orangeMaterial);
scene.add(box);

const smallBoxGeometry = new BoxGeometry({
    width: 2,
    height: 2,
    depth: 2,
});
const smallBox = new Mesh(smallBoxGeometry, purpleMaterial);
smallBox.position.x = 5; // Position it to the side of the main box
scene.add(smallBox);

const camera = new PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
);
camera.position.set(0, 3, 10);
camera.lookAt(new Vector3(0, 0, 0));

// --- Instrumentation ---
const stats = new Stats();
const panelCalls = stats.addPanel(new Stats.Panel("Calls", "#ff8", "#221"));
const panelTris = stats.addPanel(new Stats.Panel("Tris", "#f8f", "#212"));
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();
const cameraFolder = gui.addFolder("Camera");
cameraFolder.add(camera.position, "x", -20, 20);
cameraFolder.add(camera.position, "y", -20, 20);
cameraFolder.add(camera.position, "z", -20, 20);
cameraFolder.open();

window.addEventListener("resize", () => {
    renderer.resize();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

function frame() {
    stats.begin();
    renderer.render(scene, camera);
    
    panelCalls.update(renderer.info.render.calls, 100); // Max value 100? Adjust as needed
    panelTris.update(renderer.info.render.triangles, 1000); // Max value 1000? Adjust as needed
    
    stats.end();
    
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
