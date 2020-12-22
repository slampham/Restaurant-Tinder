const url = "wss://complex-pebble-wealth.glitch.me";
const connection = new WebSocket(url);

let swiped = false;

document.getElementById('left-swipe').addEventListener('click', leftSwipe);
document.getElementById('right-swipe').addEventListener('click', rightSwipe);

connection.onopen = () => {
  console.log("You have a successful WebSocket connection");
  connection.send(JSON.stringify({type: "getState"}));
};

connection.onerror = error => console.log(`WebSocket error: ${error}`);

connection.onmessage = (message) => {
  let msgObj = JSON.parse(message.data);
  
  displayWaiting()
  
  if (msgObj.type == "gameStarted" || msgObj.type == "restaurant") { 
    undisplayWaiting();
    swiped = false;
    displayRestaurant(msgObj);
  }
  else if (msgObj.type == "endGame") {
    undisplayWaiting();
    endGame(msgObj);
  }
  else if (msgObj.type == 'noMatch') {
    undisplayWaiting();
    noMatch();
  }
  
}

function leftSwipe() {
  if (swiped == false) {
    swiped = true;
    console.log("sending left swipe")
    connection.send(JSON.stringify({type: "leftSwipe"}));  
    displayWaiting();
  }
}

function rightSwipe() {
  if (swiped == false) {
    swiped = true;
    console.log("sending right swipe")
    connection.send(JSON.stringify({type: "rightSwipe"}))
    displayWaiting();
  }
}

function displayRestaurant(msg) {
  document.getElementById('restaurant-img').src = msg.image_url;
  document.getElementById('name').textContent = msg.name;
  document.getElementById('price').textContent = msg.price;
  document.getElementById('address').textContent = msg.address;

  let full_stars = Math.floor(msg.rating);
  let empty_stars = 5 - Math.ceil(msg.rating);
  let half_stars = roundHalf(5 - full_stars - empty_stars);
  
  let stars = document.getElementsByClassName("fa");
  let starNum = 0;
  
  for (let i = 0; i<full_stars; i++) {
    stars[starNum].className = "fa fa-star";
    starNum++;
  }
  
  for (let i = 0; i<half_stars; i++) {
    stars[starNum].className = "fa fa-star-half-full";
    starNum++;
  }
  
  for (let i = 0; i<empty_stars; i++) {
    stars[starNum].className = "fa fa-star-o";
    starNum++;
  }
}

function endGame(msg) {
  let swipes = document.querySelectorAll(".swipe");
  swipes.forEach(swipe => swipe.style.display = "none");

  let matches = document.querySelectorAll(".match");
  matches.forEach(match => match.style.display = "block");

  displayRestaurant(msg);
}

function noMatch() {
  let swipes = document.querySelectorAll(".swipe");
  swipes.forEach(swipe => swipe.style.display = "none");
  
  let no_matches = document.querySelectorAll(".no-match");
  no_matches.forEach(match => match.style.display = "block");
}

function displayWaiting() {
  document.getElementById("waiting").style.display = "block";
}

function undisplayWaiting() {
  document.getElementById("waiting").style.display = "none";
}

function roundHalf(num) {
  return Math.round(num * 2) / 2;
}