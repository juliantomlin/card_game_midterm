"use strict";

require('dotenv').config();

const PORT        = process.env.PORT || 8080;
const ENV         = process.env.ENV || "development";
const express     = require("express");
const bodyParser  = require("body-parser");
const sass        = require("node-sass-middleware");
const app         = express();

const knexConfig  = require("./knexfile");
const knex        = require("knex")(knexConfig[ENV]);
const morgan      = require('morgan');
const knexLogger  = require('knex-logger');

const cookieSession = require('cookie-session')
app.use(cookieSession({
  name: 'session',
  keys: ['key1'],
}))

// Seperated Routes for each Resource
const usersRoutes = require("./routes/users");

// Load the logger first so all (static) HTTP requests are logged to STDOUT
// 'dev' = Concise output colored by response status for development use.
//         The :status token will be colored red for server error codes, yellow for client error codes, cyan for redirection codes, and uncolored for all other codes.
app.use(morgan('dev'));

// Log knex SQL queries to STDOUT as well
app.use(knexLogger(knex));

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/styles", sass({
  src: __dirname + "/styles",
  dest: __dirname + "/public/styles",
  debug: true,
  outputStyle: 'expanded'
}));
app.use(express.static("public"));

// Mount all resource routes
app.use("/api/users", usersRoutes(knex));

// Home page
app.get("/", (req, res) => {
  res.render("test");
});

app.post("/login", (req, res) => {
  req.session.user_id = req.body.user_id
  res.redirect("/")
})

app.post("/newgame", (req, res) => {
  const matchId = knex.select('match_id').from('matches').where('player_2_id', null)
  if (!matchId) {
    knex.insert({match_id: generateRandomString(), player_1_id: req.session.user_id, player_1_points: '0', player_2_points: '0', game_state_id: '3', last_move_time: Date.now()})
        .into('matches')
        .asCallback(function(err){
          if (err){
            console.log(err)
          }
          knex.destroy()
        })
  }
  else {
    knex('matches')
      .where({match_id: matchId})
      .update({player_2_id: req.session.user_id})
      .asCallback(function(err){
        if (err){
          console.log(err)
        }
        knes.destroy()
      })
  }
})

app.post("/:gameId", (req, res) => {
  const gameState = knex.select('game_state_id').from('matches').where('id', req.params.gameId)       // find the current gamestate
  const playerId = req.session.user_id
  if (playerId === knex.select('player_1_id').from('matches').where('id', req.params.gameId)) {
    const player = 'player1'
  }
  else if (playerId === knex.select('player_2_id').from('matches').where('id', req.params.gameId)) {
    const player = 'player2'
  }
  if (((player === 'player1') && (gameState === 1)) || (gameState === 3) || ((player === 'player1') && (gameState === 1))) {
    if (player === 'player1'){
      knex('cards').where({match_id: req.params.gameId, card_id: req.body.card}).update({position: '5'})  //update player 1 bid
      if (gameState ===3) {
        knex('matches').where({id: req.params.gameId}).update({game_state_id: '2', last_move_time: Date.now()})                       //change gamestate to the other player
      }
      else {
        knex('matches').where({id: req.params.gameId}).update({game_state_id: '3', last_move_time: Date.now()})
      }
    }
    else if (player === 'player2') {
      knex('cards').where({match_id: req.params.gameId, card_id: req.body.card}).update({position: '6'})  //update player 2 bid
      if (gameState ===3) {
        knex('matches').where({id: req.params.gameId}).update({game_state_id: '1', last_move_time: Date.now()})                        //change gamestate to the other player
      }
      else {
        knex('matches').where({id: req.params.gameId}).update({game_state_id: '3', last_move_time: Date.now()})
      }
    }
  }
})


function generateRandomString () {
  while (true) {
    let r = Math.random().toString(36).substring(7)
    if (r.length === 6) {
      return r
    }
  }
}

app.listen(PORT, () => {
  console.log("Example app listening on port " + PORT);
});
