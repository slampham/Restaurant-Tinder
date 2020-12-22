const WebSocket = require('ws');
const express = require("express");
const http = require("http");
const app = express();
const sql = require("sqlite3").verbose();
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const fs = require("fs")

app.use(express.static("views"));
app.use("/public", express.static("public"));


/* Globals */
let numConnections = 0;
let gameId = null;
let numPlayers = 0;
let swipes = 0, leftSwipes = 0, rightSwipes = 0;
let round = 0;
let currRestId = 1;
let restaurantOrder = [];
let restaurantIndex = 0;

// how many restaurants do you want in game?
let numInitialRestaurants = 16;

/* Function to generate random url */
function makeid(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const restaurantDB = new sql.Database("restaurants.db") /* Restaurant database */

function createRestaurantDB() {
  const cmd = 'CREATE TABLE RestaurantTable (rowIdNum INTEGER PRIMARY KEY, restaurantId TEXT, name TEXT, rating DECIMAL, price TEXT, address TEXT, image_url TEXT, numLikes INTEGER)';
  restaurantDB.run(cmd, function(err, val) {
    if (err) {
      console.log("Database creation failure",err.message);
    } else {
      console.log("Created restaurant database");
    }
  });
}

let cmd = " SELECT name FROM sqlite_master WHERE type='table' AND name='RestaurantTable' ";
restaurantDB.get(cmd, function (err, val) {
    if (val == undefined) {
        console.log("No database file - creating one");
        createRestaurantDB();
    } else {
        console.log("Database file found");
    }
});

function storeRestaurant(restaurant, index, numRestaurants, ws) {
  let restaurantId = restaurant.id;
  let name = restaurant.name;
  let rating = restaurant.rating;
  let price = restaurant.price;
  let addressList = restaurant.location.display_address;
  let image_url = restaurant.image_url;
  
  // convert addressList array to string called address
  let address = "";
  addressList.forEach((str, i) => {
    address+=str;
    if (i != addressList.length-1)
      address+=" ";
  })
  
  cmd = "INSERT INTO RestaurantTable (restaurantId, name, rating, price, address, image_url, numLikes) VALUES (?,?,?,?,?,?,?) ";
  restaurantDB.run(cmd, restaurantId, name, rating, price, address, image_url, 0, function (err) {
    if (err) {
      console.log("DB insert error", err.message);
    } else {
      let newId = this.lastId;
    }
    
    // this triggers when last restaurant is inserted
    if (index==numRestaurants-1) {
        console.log("Successfully stored restaurants into database")
        cmd = 'SELECT * FROM RestaurantTable';
        restaurantDB.all(cmd, (err, restaurants) => {
          if (err)
            console.log(err);
          else {
            // send message telling host to redirect to player view
            let msgObj = {
              "type": "redirectToPlayerView"
            };
            ws.send(JSON.stringify(msgObj));
            
            // start the game
            restaurantIndex = 0;
            restaurantOrder = Array.from(Array(numRestaurants+1).keys());
            restaurantOrder.shift();
            shuffleRestaurants();
            swipes = 0;
            leftSwipes = 0;
            rightSwipes = 0;
            round = 1;
            broadcastRestaurant(restaurantOrder[restaurantIndex], "restaurant");
          }
        });
    }
  }); 
}


/* Server Routing */

// defaults url routes to home.html currently
app.get("/", (request, response) => {
  response.sendFile(__dirname + "/views/home.html");
});


/* Websocket */
const server = http.createServer(app);
const wss = new WebSocket.Server({server});

wss.on('connection', (ws) => {
  numConnections++;
  console.log(`A user has connected. There are now ${numConnections} users`);
  
  ws.on('close', ()=>{
    numConnections--;
    console.log(`A user has disconnected. There are now ${numConnections} users`);
  });
  
  ws.on('message', (message) => {
    let msgObj = JSON.parse(message);
    let msgType = msgObj.type;
    
    // when server receives a request to create a game, send a game id back to browser and clear restaurants from database
    if (msgType == "createGame") {
      createGame(ws);
    }
    
    // server requesting to start game, gets restaurants from API and start broadcasting the first round
    if (msgType=="getRestaurants") {
      getRestaurants(ws, msgObj, restaurantDB, numConnections);
    }
    
    if (msgType == "getState") {
      getState(ws);
    }

    // Nathan: we can delete this right, we don't need this anymore
    if (msgType == "autoComplete") {
      console.log("autocompleting")
      let data = msgObj.data;
      
      // parse through categories.json to get appropriate alias for keyword
      fs.readFile('./categories.json', 'utf8', (err, jsonString) => {
        if (err) {
          console.log("File read failed:", err)
        }

        // TODO: error here
        var categoriesJSON = JSON.parse(jsonString)
        for (var i = 0 ; i < jsonString.length ; i++ ) {
          if (categoriesJSON[i]['title'] == data.keyword) { 
            let msg = {
              type: "", 
              data: categoriesJSON[i]['alias']
            }
            ws.send(JSON.stringify(msg));
          }
        }
      })
    }

    if (isSwipe(msgType)) { 
      console.log("received swipe");
      ++swipes;

      if (msgType == "leftSwipe" && ++leftSwipes == numConnections) {
        console.log("all left swipes")
        // reset swipes
        leftSwipes = 0
        swipes = 0
        
        // remove current restaurant from restaurant db
        let deletecmd = "DELETE FROM RestaurantTable WHERE rowIdNum = ?"
        restaurantDB.run(deletecmd, restaurantOrder[restaurantIndex], (err)=> {
          if (err) {
            console.log(err);
          } else {  
            // remove restaurant from restaurantOrder
            restaurantOrder.splice(restaurantIndex, 1);
            
            if (!restaurantOrder.length) {
              console.log("no matches")
              // everyone disliked every restaurant
              broadcast(JSON.stringify({type: 'noMatch'}));
            } 
            else if (restaurantIndex==restaurantOrder.length && restaurantOrder.length==1) {
              // there's only one restaurant left and it has at least one like
              broadcastRestaurant(restaurantOrder[0], "endGame");
            } else if(restaurantIndex==restaurantOrder.length && round==2) {
              // went through two rounds so send the winner
              sortRestaurantsSendWinner();
            } else if(restaurantIndex==restaurantOrder.length) {
              // end of round so start next round
              round++;
              restaurantIndex = 0;
              shuffleRestaurants();
              broadcastRestaurant(restaurantOrder[restaurantIndex], "restaurant");
            } else {
              // normal case
              broadcastRestaurant(restaurantOrder[restaurantIndex], "restaurant");
            }
          }
        });
      }
      else if (msgType == "rightSwipe" && ++rightSwipes == numConnections) {
        console.log("ending game");
        broadcastRestaurant(restaurantOrder[restaurantIndex], "endGame");
      }
      else if (swipes == numConnections) {
        //store number of likes in database
        console.log("updating number of likes")
        let updateCmd = "UPDATE RestaurantTable SET numLikes = ? WHERE rowIdNum = ?"
        restaurantDB.run(updateCmd, rightSwipes, restaurantOrder[restaurantIndex], (err)=> {
          if (err) {
            console.log("could not update restaurant table");
          } else {
            if (round == 2 && restaurantIndex==restaurantOrder.length-1) {
              // game has went through two rounds so send winner
              sortRestaurantsSendWinner();
            } else if (restaurantOrder.length==1 && restaurantIndex==restaurantOrder.length-1) {
              // last restaurant in the game got at least one like, so it is the winner
              broadcastRestaurant(restaurantOrder[restaurantIndex], "endGame")
            } else { // normal case
              rightSwipes = 0;
              leftSwipes = 0;
              swipes = 0;

              // end of round coniditon
              if (restaurantIndex==restaurantOrder.length-1) {
                round++;
                restaurantIndex = 0;

                // reshuffle remaining restaurants
                shuffleRestaurants();
              } else {
                restaurantIndex++;
              }
              
              broadcastRestaurant(restaurantOrder[restaurantIndex], "restaurant");
            }
          }
        });
        
      }
    }
  });
  
  let msgObj = {
    "type": "verify",
    "data": `You are user number ${numConnections} in this session`
  }
  ws.send(JSON.stringify(msgObj));
})

server.listen(process.env.PORT, () => console.log("Your app is listening on port " + server.address().port));

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function broadcastRestaurant(id, type) {
  let cmd = ' SELECT * FROM RestaurantTable WHERE rowIdNum = ?';
  restaurantDB.get(cmd, id, dataCallback );
  function dataCallback(err, rowData) {    
     if (err) { 
       console.log("error: ", err.message);
     } else {  
       let msgObj = {
         type: type,
         name: rowData.name, 
         rating: rowData.rating,
         price: rowData.price,
         address: rowData.address,
         image_url: rowData.image_url,
       }
       broadcast(JSON.stringify(msgObj));
     }
  }
}


// Helper function to check if a message type is a swipe
function isSwipe(msgType) {
  return msgType == "leftSwipe" || msgType == "rightSwipe";
}

function createGame(ws) {
  console.log("A user is creating a game");
  round = 0;
  
  // create a unique game id that we will use in the link that we give to the players
  gameId = makeid(20);
  
  // send gameId to host
  let msg = {
    "type": "url",
    "data": gameId
  }
  ws.send(JSON.stringify(msg));
  
  // delete previous restaurants from database
  let cmd = 'DELETE FROM RestaurantTable';
  restaurantDB.run(cmd, (err)=> {
    if (err) console.log(err);
    console.log("Deleted previous restaurants from database");
  });
}

function getRestaurants(ws, msgObj, numConnections) {
  numPlayers = numConnections;
  let data = msgObj.data;
  let location = data.location;
  let keywords = data.keyword;
  keywords = keywords.replace(/,/g, ' ');
  console.log("keywords:", keywords);
        
  // get list of restaurants from API
  let apiCall = "https://api.yelp.com/v3/businesses/search?categories=restaurants&limit=" + numInitialRestaurants + "&location=" + location + "&term=" + keywords;
  
  const xhr = new XMLHttpRequest();
  xhr.open("GET", apiCall);
  xhr.setRequestHeader("Authorization", "Bearer "+process.env.API_KEY);
  
  xhr.onloadend = function(e) {
    let responseText = JSON.parse(xhr.responseText);
    let restaurants = responseText.businesses;
    console.log("Received restaurants from API");
    console.log("Storing restaurants in database...")
    
    let firstRestaurantId = null
    restaurants.forEach((restaurant, i) => {
      if (i == 0) {
        firstRestaurantId = restaurant.id
      }
      storeRestaurant(restaurant, i, restaurants.length, ws);
    });
    
    let cmd = 'SELECT * FROM RestaurantTable WHERE rowIdNum = ?';
    restaurantDB.get(cmd, 1, dataCallback);
    function dataCallback(err, rowData) {    
        if (err) { 
          console.log("error: ",err.message);
        } else {   
          console.log("got row data");
          let msg = {
            type: "gameStarted",
            name: rowData.name, 
            rating: rowData.rating,
            price: rowData.price,
            address: rowData.address,
            image_url: rowData.image_url,
          }
          ws.send(JSON.stringify(msg));
      }
    }
  }
  xhr.send();
}

function getState(ws) {
  /* this code is solely for the host when he gets the restaurants and is redirected
     when he's redirected, there's a time period when the restaurant gets broadcasted to all the players but his player page still hasnt loaded so he doesn't get the restaurant
     so every player sends this message to the server but only the host is gonna send the message w a message being sent back to his player page */
  console.log("in get state");
  if (round > 0) {
    let cmd = 'SELECT * FROM RestaurantTable WHERE rowIdNum = ?';
    restaurantDB.get(cmd, restaurantOrder[restaurantIndex], dataCallback);
    function dataCallback(err, rowData) {    
        if (err) { 
          console.log("error: ",err.message);
        } else {   
          console.log("got row data");
          let msg = {
            type: "gameStarted",
            name: rowData.name, 
            rating: rowData.rating,
            price: rowData.price,
            address: rowData.address,
            image_url: rowData.image_url,
          }
          ws.send(JSON.stringify(msg));
      }
    }
  }
}


function sortRestaurantsSendWinner() {
  restaurantDB.all("SELECT * FROM RestaurantTable", function(err, rows) {  
    if (err)
      console.log("could not get all rows from restaurant table");
    // sort rows by their number of likes
    rows.sort(function(a, b) {
      let keyA = a.numLikes;
      let keyB = b.numLikes;
      if (keyA < keyB) return 1;
      if (keyA > keyB) return -1;
      return 0;
    }); 

    // get first element
    broadcastRestaurant(rows[0].rowIdNum, "endGame")
  });
}


function shuffleRestaurants() {
  for (let i = restaurantOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i)
    const temp = restaurantOrder[i];
    restaurantOrder[i] = restaurantOrder[j];
    restaurantOrder[j] = temp;
  }
}