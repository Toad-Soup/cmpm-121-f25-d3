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

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("Player Location");
playerMarker.addTo(map);

// Display the player's points
let playerPoints = 0;
statusPanelDiv.innerHTML = "No points yet...";

interface Point {
  x: number;
  y: number;
}

type key = number;
type contents = number | null;

const playerPosition = CLASSROOM_LATLNG;

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  console.log(i, j);

  let rectVal = Math.pow(
    2,
    Math.floor(luck([i, j, "initialValue"].toString()) * 4),
  );

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Display text on the cache
  const tooltip = leaflet.tooltip({ permanent: true, direction: "center" })
    .setContent(rectVal.toString());
  rect.bindTooltip(tooltip);

  rect.on("click", () => {
    if (distance_to_player(i, j) <= RANGE) {
      if (playerPoints == 0) {
        playerPoints += rectVal;
        statusPanelDiv.innerHTML = `currently holding: ${playerPoints}`;
        rect.remove();
      } else if (playerPoints == rectVal) {
        rectVal *= 2;
        playerPoints = 0;
        statusPanelDiv.innerHTML = "Slug Successfully Stacked";
      }
      tooltip.setContent(rectVal.toString());
    } else {
      statusPanelDiv.innerHTML = "Slug out of reach :(";
    }
  });
}

generateCells({
  x: coordToIndex(playerPosition.lat),
  y: coordToIndex(playerPosition.lng),
});

function generateCells(origin: Point) {
  console.log(origin);
  for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
      const x = origin.x + i;
      const y = origin.y + j;
      if (luck([x, y].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(x, y);
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
