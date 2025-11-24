// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./_leafletWorkaround.ts";

// Import luck
import luck from "./_luck.ts";

// UI elements
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
controlPanelDiv.innerHTML = `<h1>D3: Slug Stack!</h1>`;
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 25;
const CACHE_SPAWN_PROBABILITY = 0.1;
const RANGE = 5;

const map = leaflet.map(mapDiv, {
  center: [0, 0], // temporary, will be updated by GPS
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

const cellGroup = leaflet.layerGroup().addTo(map);

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerPosition = leaflet.latLng(0, 0);
let playerMarker = leaflet.marker(playerPosition).bindTooltip("Player Location")
  .addTo(map);

let playerPoints = 0;
statusPanelDiv.innerHTML = "No points yet...";

interface Point {
  x: number;
  y: number;
}

const cellMap = new Map<string, number | null>();

//save game functionality
function saveGameState() {
  localStorage.setItem("playerLat", String(playerPosition.lat));
  localStorage.setItem("playerLng", String(playerPosition.lng));
  localStorage.setItem("playerPoints", String(playerPoints));
  localStorage.setItem("cellMap", JSON.stringify([...cellMap.entries()]));
}

//load game functionality
function loadGameState() {
  const lat = localStorage.getItem("playerLat");
  const lng = localStorage.getItem("playerLng");
  const pts = localStorage.getItem("playerPoints");
  const cm = localStorage.getItem("cellMap");

  if (lat && lng) {
    playerPosition.lat = Number(lat);
    playerPosition.lng = Number(lng);
  }
  if (pts) playerPoints = Number(pts);
  if (cm) {
    const entries = JSON.parse(cm);
    cellMap.clear();
    for (const [k, v] of entries) cellMap.set(k, v);
  }
}

// load game state
loadGameState();

//create cells
function keyFrom(i: number, j: number) {
  return `${i},${j}`;
}

function indexToCoord(i: number) {
  return i * TILE_DEGREES;
}

function coordToIndex(c: number) {
  return Math.floor(c / TILE_DEGREES);
}

function pointCoordToIndex(ll: leaflet.LatLng): Point {
  return { x: coordToIndex(ll.lat), y: coordToIndex(ll.lng) };
}

function distance_to_player(i: number, j: number) {
  const pp = pointCoordToIndex(playerPosition);
  const dx = i - pp.x;
  const dy = j - pp.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function check_game_won(v: number) {
  if (v >= 256) {
    statusPanelDiv.innerHTML = "You did it!!";
  }
}

function spawnCache(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  console.log(playerPosition);

  const key = keyFrom(i, j);
  let rectVal: number | null = cellMap.has(key)
    ? cellMap.get(key)!
    : Math.pow(2, Math.floor(luck([i, j, "initial"].toString()) * 4));

  const rect = leaflet.rectangle(bounds).addTo(cellGroup);

  const tooltip = leaflet
    .tooltip({ permanent: true, direction: "center" })
    .setContent(rectVal + "");
  rect.bindTooltip(tooltip);

  rect.on("click", () => {
    if (distance_to_player(i, j) <= RANGE) {
      console.log(rectVal);
      if (rectVal !== null) {
        console.log(playerPoints);
        if (playerPoints === 0) {
          playerPoints += rectVal;
          statusPanelDiv.innerHTML = `currently holding: ${playerPoints}`;
          cellMap.set(key, null);
          tooltip.setContent("empty");
          rect.remove();
        } else if (playerPoints === rectVal) {
          rectVal *= 2;
          check_game_won(rectVal);
          playerPoints = 0;
          cellMap.set(key, rectVal);
          tooltip.setContent(rectVal.toString());
        }
      }
      saveGameState();
    } else {
      statusPanelDiv.innerHTML = "Slug out of reach :(";
    }
  });
}

function generateCells() {
  cellGroup.clearLayers();
  const center = pointCoordToIndex(playerPosition);

  console.log(playerPosition);

  for (let di = -NEIGHBORHOOD_SIZE; di < NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj < NEIGHBORHOOD_SIZE; dj++) {
      const i = center.x + di;
      const j = center.y + dj;

      const key = keyFrom(i, j);
      if (cellMap.has(key)) {
        const v = cellMap.get(key);
        if (v !== null) spawnCache(i, j);
      } else if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(i, j);
      }
    }
  }
}

//player movement
function move_player_absolute(lat: number, lng: number) {
  playerPosition.lat = lat;
  playerPosition.lng = lng;

  playerMarker.remove();
  playerMarker = leaflet.marker(playerPosition).bindTooltip("Player Location")
    .addTo(map);

  map.setView(playerPosition, GAMEPLAY_ZOOM_LEVEL);

  generateCells();
  saveGameState();
}

//uses GPS
//had to do a lot of dumb stuff for this to work jesus christ
class GeoExactMovementController {
  private watchId: number | null = null;

  start() {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }

    // Initialize with current position
    navigator.geolocation.getCurrentPosition(
      (pos) => move_player_absolute(pos.coords.latitude, pos.coords.longitude),
      (err) => console.error(err),
      { enableHighAccuracy: true },
    );

    // Watch position continuously
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => move_player_absolute(pos.coords.latitude, pos.coords.longitude),
      (err) => console.error(err),
      { enableHighAccuracy: true },
    );
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
  }
}

const controller = new GeoExactMovementController();
controller.start();

//new game
const newGameBtn = document.createElement("button");
newGameBtn.textContent = "NEW GAME";
newGameBtn.onclick = () => {
  localStorage.clear();
  location.reload();
};
controlPanelDiv.append(newGameBtn);

const DIRECTION_RIGHT: Point = {
  x: 1,
  y: 0,
};
const DIRECTION_LEFT: Point = {
  x: -1,
  y: 0,
};
const DIRECTION_UP: Point = {
  x: 0,
  y: 1,
};
const DIRECTION_DOWN: Point = {
  x: 0,
  y: -1,
};

const LEFT = document.createElement("button");
LEFT.innerHTML = "MOVE: Left";
LEFT.addEventListener("click", () => {
  move_player(DIRECTION_LEFT);
});

const RIGHT = document.createElement("button");
RIGHT.innerHTML = "MOVE: Right";
RIGHT.addEventListener("click", () => {
  move_player(DIRECTION_RIGHT);
});

const UP = document.createElement("button");
UP.innerHTML = "MOVE: Up";
UP.addEventListener("click", () => {
  move_player(DIRECTION_UP);
});

const DOWN = document.createElement("button");
DOWN.innerHTML = "MOVE: Down";
DOWN.addEventListener("click", () => {
  move_player(DIRECTION_DOWN);
});
const inputPanelDiv = document.createElement("div");
inputPanelDiv.id = "inputPanel";
document.body.append(inputPanelDiv);

inputPanelDiv.appendChild(LEFT);
inputPanelDiv.appendChild(RIGHT);
inputPanelDiv.appendChild(UP);
inputPanelDiv.appendChild(DOWN);

function move_player(dir: Point) {
  playerPosition.lat += indexToCoord(dir.y);
  playerPosition.lng += indexToCoord(dir.x);
  playerMarker.remove();

  playerMarker = leaflet.marker(playerPosition);
  playerMarker.bindTooltip("That's you!");
  playerMarker.addTo(map);

  generateCells();
}
