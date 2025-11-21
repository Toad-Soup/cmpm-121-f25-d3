// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./_leafletWorkaround.ts";

// Import our luck function
import luck from "./_luck.ts";

// Create basic UI elements
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

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 25;
const CACHE_SPAWN_PROBABILITY = 0.1;
const RANGE = 5;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

const cellGroup = leaflet.layerGroup().addTo(map);

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
let playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("Player Location");
playerMarker.addTo(map);

// Display the player's points
let playerPoints = 0;
statusPanelDiv.innerHTML = "No points yet...";

interface Point {
  x: number;
  y: number;
}

//we need to create a map for memento
//needs to also hold null to show that the node is empty?
const cellMap = new Map<string, number | null>();

type contents = number | null;

const playerPosition = CLASSROOM_LATLNG;

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  const key = keyFrom(i, j);

  let rectVal: number | null;
  if (cellMap.has(key)) {
    rectVal = cellMap.get(key)!;
  } else {
    rectVal = Math.pow(
      2,
      Math.floor(luck([i, j, "initialValue"].toString()) * 4),
    );
  }

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(cellGroup);

  // Display text on the cache
  const tooltip = leaflet.tooltip({ permanent: true, direction: "center" })
    .setContent(rectVal.toString());
  rect.bindTooltip(tooltip);

  rect.on("click", () => {
    if (distance_to_player(i, j) <= RANGE) {
      if (rectVal !== null) {
        if (playerPoints == 0) {
          playerPoints += rectVal;
          statusPanelDiv.innerHTML = `currently holding: ${playerPoints}`;
          cellMap.set(key, null);
          tooltip.setContent("empty");
          rect.remove();
          return;
        } else if (playerPoints == rectVal) {
          statusPanelDiv.innerHTML = "Slug Successfully Stacked";
          rectVal *= 2;
          check_game_won(rectVal);
          playerPoints = 0;
        }
        cellMap.set(key, rectVal);
        tooltip.setContent(rectVal.toString());
      }
    } else {
      statusPanelDiv.innerHTML = "Slug out of reach :(";
    }
  });
}

generateCells();

function generateCells() {
  cellGroup.clearLayers();

  const mapCenter = pointCoordToIndex(map.getCenter());

  for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
      const x = mapCenter.x + i;
      const y = mapCenter.y + j;

      const key = keyFrom(x, y);
      if (cellMap.has(key)) {
        const saved = cellMap.get(key);
        if (saved === null) {
          //remember the cell was deleted
          continue;
        } else {
          //remember the cells updated value and spawn it back
          spawnCache(x, y);
        }
      } else {
        if (luck([x, y].toString()) < CACHE_SPAWN_PROBABILITY) {
          spawnCache(x, y);
        }
      }
    }
  }
}

function distance_to_player(i: number, j: number) {
  const playerPoint = {
    x: coordToIndex(playerPosition.lat),
    y: coordToIndex(playerPosition.lng),
  };
  const dx = i - playerPoint.x;
  const dy = j - playerPoint.y;
  return Math.sqrt((dx ** 2) + (dy ** 2));
}

function coordToIndex(c: number) {
  return Math.floor(c / TILE_DEGREES);
}

function check_game_won(just_made: number) {
  if (just_made >= 256) {
    console.log("you won");
    statusPanelDiv.innerHTML = "you did it!!";
  }
}

function pointCoordToIndex(ll: leaflet.LatLng): Point {
  return { x: coordToIndex(ll.lat), y: coordToIndex(ll.lng) };
}

function move_player(dir: Point) {
  playerPosition.lat += indexToCoord(dir.y);
  playerPosition.lng += indexToCoord(dir.x);
  playerMarker.remove();

  playerMarker = leaflet.marker(playerPosition);
  playerMarker.bindTooltip("That's you!");
  playerMarker.addTo(map);

  generateCells(); // REFRESH MAP EVERY MOVE
}

function indexToCoord(i: number) {
  return i * TILE_DEGREES;
}

//gets the key for the map
function keyFrom(i: number, j: number): string {
  return `${i},${j}`;
}

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
