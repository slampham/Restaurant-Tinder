// Websocket code
const url = "wss://complex-pebble-wealth.glitch.me";
const connection = new WebSocket(url);

let gameId;

connection.onopen = () => {
  console.log("You have a successful WebSocket connection");
};

connection.onerror = error => {
  console.log(`WebSocket error: ${error}`);
};

connection.onmessage = (message) => {
  let msgObj = JSON.parse(message.data);
  let msgType = msgObj.type;
  
  if (msgType=="url") {
    gameId = msgObj.data;
    console.log(`Received id: ${gameId}`);
    
    // Hide "Start game" and make search controls appear 
    document.getElementById("start").style.display = "none";
    document.getElementById("get-restaurants-div").style.display = "flex";
    document.getElementById("search-controls").style.display = "flex";
    
    // Display link
    document.getElementById("link").innerHTML = "https://complex-pebble-wealth.glitch.me/player.html?" + gameId;
    document.getElementById("link").href = "https://complex-pebble-wealth.glitch.me/player.html?" + gameId;
    document.getElementById("player-link").style.display=  "flex";
  }
  
  if (msgType=="verify") {
    console.log(msgObj.data);
  }
  
  // Redirect
  if (msgType=="redirectToPlayerView") {
    window.location.href = "https://complex-pebble-wealth.glitch.me/player.html?id=" + gameId;
  }
  
}


// Event Listener to create game
document.getElementById("start-game").addEventListener('click', function() {
  
  document.getElementById("start-game").innerHTML = "Starting..."
  
  // lets the server know a new game is trying to be initiated
  let msgObj = {
    "type": "createGame"
  }
  connection.send(JSON.stringify(msgObj));
  console.log("Sending create game commmand to server");
});

// Event listener to start game
document.getElementById("get-restaurants").addEventListener('click', function() {
  console.log("Sending search parameters to server");
  document.getElementById("get-restaurants").innerHTML = "Redirecting...";
  
  // Get location and keywords, convert to JSON
  var location = document.getElementById("location").value;
  var keywords = document.getElementsByClassName("keyword-search");
  var keywordArray = keywords[0].value.split(",")
  
  // TODO: Convert autocomplete titles to yelp aliases
  // let autocompleteMsg = {
  //   "type": "autoComplete",
  //   "data":keywordArray,
  // }
  // connection.send(JSON.stringify(autocompleteMsg))
  
  var url = gameId
  let data = {
    location: location,
    keyword: keywords[0].value, //TODO: this should be multiple keywords from after autocomplete
    url: gameId
  }
  
  let msgObj = {
    "type": "getRestaurants",
    "data": data
  }
  connection.send(JSON.stringify(msgObj));
});


var numKeywords = 0
// checkKeywords()
function checkKeywords() { 
  var keywordText = document.getElementsByClassName("keyword-search")[numKeywords].value
  
  if (keywordText != "") { 
    var tag1 = document.createElement("input")
    tag1.setAttribute("list", "restaurants")
    tag1.setAttribute("class", "keyword-search")
    document.getElementById("keyword-controls").appendChild(tag1)
    
    numKeywords++
  }
  
  setTimeout(checkKeywords, 400)
}




// Ryan added all below code

// get reference to select element
var sel = document.getElementById('restaurants');

// data is loaded by home.html so ignore this error
var categories = data;

categories.forEach(category => {
  // create new option element
  var opt = document.createElement('option');

  // set value property of opt
  opt.value = category; 

  // add opt to end of select box (sel)
  sel.appendChild(opt); 
});

// https://www.meziantou.net/html-multiple-selections-with-datalist.htm
document.addEventListener("DOMContentLoaded", function () {
    const separator = ',';
    for (const input of document.getElementsByTagName("input")) {
        if (!input.multiple) {
            continue;
        }
        if (input.list instanceof HTMLDataListElement) {
            const optionsValues = Array.from(input.list.options).map(opt => opt.value);
            let valueCount = input.value.split(separator).length;
            input.addEventListener("input", () => {
                const currentValueCount = input.value.split(separator).length;
                // Do not update list if the user doesn't add/remove a separator
                // Current value: "a, b, c"; New value: "a, b, cd" => Do not change the list
                // Current value: "a, b, c"; New value: "a, b, c," => Update the list
                // Current value: "a, b, c"; New value: "a, b" => Update the list
                if (valueCount !== currentValueCount) {
                    const lsIndex = input.value.lastIndexOf(separator);
                    const str = lsIndex !== -1 ? input.value.substr(0, lsIndex) + separator : "";
                    filldatalist(input, optionsValues, str);
                    valueCount = currentValueCount;
                }
            });
        }
    }
    function filldatalist(input, optionValues, optionPrefix) {
        const list = input.list;
        if (list && optionValues.length > 0) {
            list.innerHTML = "";
            const usedOptions = optionPrefix.split(separator).map(value => value.trim());
            for (const optionsValue of optionValues) {
                if (usedOptions.indexOf(optionsValue) < 0) {
                    const option = document.createElement("option");
                    option.value = optionPrefix + optionsValue;
                    list.append(option);
                }
            }
        }
    }
});