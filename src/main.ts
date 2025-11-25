// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./_leafletWorkaround.ts";

// Import luck
import luck from "./_luck.ts";

const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

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
  center: CLASSROOM_LATLNG, // temporary, will be updated by GPS
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

map.on("moveend", generateCells);

//**********************************save and load functionality********************************************** */
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

loadGameState();

//*************************************helper functs*************************************** */
function keyFrom(i: number, j: number) {
  return `${i},${j}`;
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

//************************************spawn cells********************************************** */
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

generateCells();

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

//******************************************new game *******************************************/
const newGameBtn = document.createElement("button");
newGameBtn.textContent = "NEW GAME";
newGameBtn.onclick = () => {
  localStorage.clear();
  location.reload();
};
controlPanelDiv.append(newGameBtn);

class PlayerNavigator {
  position: leaflet.LatLng;
  geolocationBased: boolean;
  #watchID: number | null;
  constructor(geolocationBased: boolean) {
    this.position = CLASSROOM_LATLNG;
    this.geolocationBased = geolocationBased;
    this.#watchID = null;

    // initialize watcher
    if (this.geolocationBased) {
      this.#createGeolocationWatcher();
    }
  }
  setGeolocationBased(geolocationBased: boolean) {
    this.geolocationBased = geolocationBased;
    if (this.geolocationBased) {
      // start watching player's geolocation
      this.#createGeolocationWatcher();
    } else {
      // stop watching player's geolocation
      navigator.geolocation.clearWatch(this.#watchID!);
    }
    udpateMovementModeButtonText();
  }
  manuallyMovePlayer(delta: leaflet.LatLng) {
    if (!this.geolocationBased) {
      this.position.lat += delta.lat;
      this.position.lng += delta.lng;
      this.#updatePlayerMarker();
    }
  }
  #createGeolocationWatcher() {
    this.#watchID = navigator.geolocation.watchPosition(
      (pos: GeolocationPosition) => {
        this.position.lat = pos.coords.latitude;
        this.position.lng = pos.coords.longitude;
        this.#updatePlayerMarker();
      },
      () => {
        // if it fails, go back to buttons
        this.setGeolocationBased(false);
      },
    );
  }
  #updatePlayerMarker() {
    playerMarker.remove();
    playerMarker = leaflet.marker(this.position);
    playerMarker.bindTooltip("That's you!");
    playerMarker.addTo(map);
    map.setView(this.position);
  }
}

const playerNav = new PlayerNavigator(true);

//make it look pretties ty tate
function makeDiv(id: string): HTMLDivElement {
  const div = document.createElement("div");
  div.id = id;
  document.body.append(div);
  return div;
}

// Movement Buttons
const buttonPanelDiv = makeDiv("buttonPanel");

function makeButtonMove(text: string, delta: leaflet.LatLng) {
  const buttonDebugMove = document.createElement("button");
  buttonDebugMove.innerHTML = text;
  buttonDebugMove.addEventListener("click", () => {
    playerNav.manuallyMovePlayer(delta);
  });
  buttonPanelDiv.appendChild(buttonDebugMove);
  return buttonDebugMove;
}

makeButtonMove("LEFT", leaflet.latLng(0, -TILE_DEGREES));
makeButtonMove("RIGHT", leaflet.latLng(0, TILE_DEGREES));
makeButtonMove("UP", leaflet.latLng(TILE_DEGREES, 0));
makeButtonMove("DOWN", leaflet.latLng(-TILE_DEGREES, 0));

document.body.appendChild(document.createElement("br"));
const settingsDiv = makeDiv("settingsPanel");
const movementModeButton = document.createElement("button");
movementModeButton.id = "movementMode";
movementModeButton.addEventListener("click", () => {
  playerNav.setGeolocationBased(!playerNav.geolocationBased);
  udpateMovementModeButtonText();
});
udpateMovementModeButtonText();
settingsDiv.appendChild(movementModeButton);

function udpateMovementModeButtonText() {
  if (playerNav.geolocationBased) {
    movementModeButton.innerHTML = "Switch to Button Movement";
  } else {
    movementModeButton.innerHTML = "Switch to Geolocation Movement";
  }
}
