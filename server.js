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
const knexQueries = require('./knex_query.js');

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
  res.render("index");
});


app.get("/match/:gameId", (req, res) => {
  let templateVars = {}
  knex('matches')
    .select('u1.name as name1','u2.name as name2', 'u1.ranking as ranking1', 'u2.ranking as ranking2', 'player1_points', 'player2_points', 'player1_id', 'player2_id')
    .innerJoin('users as u1', function() {
      this.on('u1.id','=','matches.player1_id')
    })
    .innerJoin('users as u2', function() {
      this.on('u2.id','=','matches.player2_id')
    })
    .where('matches.id', req.params.gameId)
    .asCallback(function(err, data){
      knex('cards')
        .select('position_id', 'value', 'card_id')
        .join('card_lookup', {'card_lookup.id': 'card_id'})
        .where('match_id', req.params.gameId)
        .asCallback(function(err, cards){
          // console.log(req.session.user_id, data[0].player1_id, data[0])
          templateVars.gameId = req.params.gameId
          if (req.session.user_id === data[0].player1_id){
            templateVars.cards_left_deck = false
            templateVars.opponent_bid = false
            templateVars.user = data[0].name1
            templateVars.opponent_name = data[0].name2
            templateVars.player_ranking = data[0].ranking1
            templateVars.opponent_ranking = data[0].ranking2
            templateVars.player_points = data[0].player1_points
            templateVars.opponent_points = data[0].player2_points
            templateVars.player_hand = []
            templateVars.opponent_hand_size = 0
            templateVars.player_bid = null
            templateVars.prize = null
            for (let card in cards) {
              if (cards[card].position_id === 1) {
                templateVars.player_hand.push({value: cards[card].value, id: cards[card].card_id})
              }
              else if (cards[card].position_id === 7) {
                templateVars.prize = cards[card].value
              }
              else if (cards[card].position_id === 5) {
                templateVars.player_bid = cards[card].value
              }
              else if (cards[card].position_id === 6) {
                templateVars.opponent_bid = true
              }
              else if (cards[card].position_id === 3) {
                templateVars.cards_left_deck = true
              }
              else if (cards[card].position_id === 2) {
                templateVars.opponent_hand_size ++
              }
            }
          }
          else if (req.session.user_id === data[0].player2_id) {
            templateVars.cards_left_deck = false
            templateVars.opponent_bid = false
            templateVars.user = data[0].name2
            templateVars.opponent_name = data[0].name1
            templateVars.player_ranking = data[0].ranking2
            templateVars.opponent_ranking = data[0].ranking1
            templateVars.player_points = data[0].player2_points
            templateVars.opponent_points = data[0].player1_points
            templateVars.player_hand = []
            templateVars.opponent_hand_size = 0
            templateVars.player_bid = null
            templateVars.prize = null
            for (let card in cards) {
              if (cards[card].position_id === 2) {
                templateVars.player_hand.push({value: cards[card].value, id: cards[card].card_id})
              }
              else if (cards[card].position_id === 7) {
                templateVars.prize = cards[card].value
              }
              else if (cards[card].position_id === 6) {
                templateVars.player_bid = cards[card].value
              }
              else if (cards[card].position_id === 5) {
                templateVars.opponent_bid = true
              }
              else if (cards[card].position_id === 3) {
                templateVars.cards_left_deck = true
              }
              else if (cards[card].position_id === 1) {
                templateVars.opponent_hand_size ++
              }
            }
          }
          if (templateVars.player_bid && templateVars.opponent_bid) {       //failsafe against the game locking up when 2 players bid at the same time
            console.log('++++++++lock prevented')
            newTurn(req.params.gameId, res)
          }
          else {
            templateVars.player_hand.sort(function(a, b) {
              return a.value - b.value
            })
            console.log('templatevars', templateVars)
            res.render("match_id", templateVars)
          }
    })
  })
})


//-------------------------------------------------------------------------


//-----------------------------------------------------------------------------
app.post("/login", (req, res) => {
  knex('users').select('id').where({'name': req.body.user}).asCallback(function(err, output){
    if (output){
      req.session.user_id = output[0].id
      res.redirect(`/user/${req.session.user_id}`)
    }
    else {
      knex('users').returning('id').insert({'name': req.body.user, 'ranking': 1000}).asCallback(function(err, newId){
        if (err){
          console.log(err)
        }
        req.session.user_id = newId[0]
        res.redirect(`/user/${req.session.user_id}`)
      })
    }
  })
})
  // req.session.user_id = knex('users').select('id').where({'name': req.body.user_id}).then(function(err, rows){
  //   console.log(`return ${rows[0].id} return`)
  // })
  // console.log(`user_id${req.session.user_id}`)

//-----------------------------------------------------------------------------
app.post("/newgame", (req, res) => {
  knex.select('id').from('matches').whereNot('player1_id', req.session.user_id).andWhere('player2_id', null).asCallback(function(err, number){
    if (!number[0]) {
      knex.insert({player1_id: req.session.user_id, player1_points: '0', player2_points: '0', game_state_id: '3', last_move: new Date()})
          .into('matches')
          .asCallback(function(err){
            if (err){
              console.log(err)
            }
            res.redirect(`/`)
          })
    }
    else {
      knex('matches')
        .where({id: number[0].id})
        .update({player2_id: req.session.user_id, last_move: new Date()})
        .asCallback(function(err){
          if (err){
            console.log(err)
          }
          console.log('NewGameMade Sucessfully')
          dealHands(number[0].id)
          res.redirect(`/match/${number[0].id}`)
        })
    }
  })
})
//------------------------------------------------------------------------------------
function dealHands (matchId){
  knex('card_lookup').select('id', 'suit').asCallback(function(err,cards){
    let position = '1'
    const drawnCardIndex = Math.floor(Math.random() * 13)
    let deck = []
    for (let card in cards){
      let skip = false
      if (cards[card].suit === 'h'){
        position = '1'
      } else if (cards[card].suit === 's'){
        position = '2'
      } else if (cards[card].suit === 'd'){
        position = '3'
        deck.push(cards[card].id)
      } else {
        skip = true
      }
      if (!skip){
        knex('cards').insert({'match_id': matchId, 'card_id': cards[card].id, 'position_id': position})
        .returning('id')
        .then((id) => {
          if (deck.length === 13){
            knex('cards').where('match_id', matchId).andWhere('card_id', deck[drawnCardIndex])
            .update({'position_id': '7'}).asCallback(function(err){})
          }
        });
      }
    }
  })
}

app.post("/match/:gameId", (req, res) => {
  knex.select('game_state_id', 'player1_id', 'player2_id').from('matches').where('id', req.params.gameId).asCallback(function(err, gameInfo){       // find the current gamestate
    const playerId = req.session.user_id
    const gameState = gameInfo[0].game_state_id
    if ( (gameState != 4) ) {
      console.log(`test ${playerId}, ${ gameInfo[0].player1_id}, ${ gameInfo[0].player2_id}, ${gameState}`)
      if (playerId === gameInfo[0].player1_id) {
        placeBid(5, 2, req.params.gameId, req.body.card, gameState, res, 1)
      }
      else if (playerId === gameInfo[0].player2_id) {
        console.log('correct path')
        placeBid(6, 1, req.params.gameId, req.body.card, gameState, res, 2)
      }
    }
  })
})

function placeBid (newPosition, newGamestate, gameId, card, gameState, res, otherTurn) {
  console.log('bid is trying to be placed')
    if (gameState === 3) {
      console.log('trying to place bid with gamestate 3')
      console.log(newPosition, newGamestate, gameId, card, gameState, otherTurn)
      knex('cards').where({'match_id': gameId}).andWhere({'card_id': card}).update({'position_id': newPosition}).asCallback(function(err){
        knex('matches').where({'id': gameId}).update({'game_state_id': newGamestate, 'last_move': new Date()}).asCallback(function(err){
          res.redirect(`/match/${gameId}`)
        })
      })                     //change gamestate to the other player
    }
    else if (gameState === otherTurn){
      knex('cards').where({'match_id': gameId}).andWhere({'card_id': card}).update({'position_id': newPosition}).asCallback(function(err){
        console.log('______ new turn after both bids placed')
        newTurn(gameId, res)
      })
    }
    else {
      res.redirect(`/match/${gameId}`)
    }
}


function newTurn (matchId, res) {
  knex('matches').where({'id': matchId}).update({'game_state_id': '3', 'last_move': new Date()}).asCallback(function(err){})
  knex('cards').select('value').where({'match_id': matchId}).andWhere({'position_id': '7'}).join('card_lookup', {'card_lookup.id': 'card_id'}).asCallback(function(err, prize){
    knex('cards').select('value').where({'match_id': matchId}).andWhere({'position_id': '5'}).join('card_lookup', {'card_lookup.id': 'card_id'}).asCallback(function(err, player1Card){
      knex('cards').select('value').where({'match_id': matchId}).andWhere({'position_id': '6'}).join('card_lookup', {'card_lookup.id': 'card_id'}).asCallback(function(err, player2Card){
        if (!player1Card[0] || !player2Card[0] || !prize[0]) {
          console.log('============= redirecting after error')
          console.log(`p1 card ${player1Card[0]}, p2 card ${player2Card[0]}, prize ${prize[0]}`)
          res.redirect(`/match/${matchId}`)
        }
        else {
          console.log(`p1 card ${player1Card[0].value}, p2 card ${player2Card[0].value}, prize ${prize[0].value}`, player1Card, player2Card, prize)
          if (player1Card[0].value > player2Card[0].value){
            awardPoints('player1_points', prize[0].value, matchId)
          }
          else if (player1Card[0].value < player2Card[0].value){
            awardPoints('player2_points', prize[0].value, matchId)
          }
          knex('cards').where({'match_id': matchId}).andWhere({'position_id': '7'}).update({'position_id': '4'}).asCallback(function(err){
            knex('cards').where({'match_id': matchId}).andWhere({'position_id': '5'}).update({'position_id': '4'}).asCallback(function(err){
              knex('cards').where({'match_id': matchId}).andWhere({'position_id': '6'}).update({'position_id': '4'}).asCallback(function(err){
                newPrize(matchId, res)
              })
            })
          })
        }
      })
    })
  })
}

function awardPoints (winner, prize, matchId) {
  knex('matches').where({'id': matchId}).select(winner).asCallback(function(err, points){
    const newPrize = (points[0][winner]) + (prize)
    const updateString = `{"${winner}": ${newPrize}}`
    const updateValue = {winner: newPrize}
    console.log(typeof newPrize, newPrize, winner, points[0], points[0][winner])
    knex('matches').where({'id': matchId}).update(JSON.parse(updateString)).asCallback(function(err){
      if (err){
        throw err
      }
    })
  })
}


function newPrize (matchId, res) {
  knex('cards').select('card_id').where({'match_id': matchId}).andWhere({'position_id': '3'}).asCallback(function(err, cards){
    if (cards.length === 0 ) {
      knex('matches').where({'id': matchId}).update({'game_state_id': '4'}).asCallback(function(err){         //gameover
        res.redirect(`/match/${matchId}`)
      })
    } else {
      const drawnCardIndex = Math.floor(Math.random() * cards.length)
      console.log(`card to be selected for a new prize ${cards[drawnCardIndex].card_id}`)
      knex('cards').where('match_id', matchId).andWhere('card_id', cards[drawnCardIndex].card_id).update({'position_id': '7'}).asCallback(function(err){
        res.redirect(`/match/${matchId}`)
      })
    }
  })
}

function generateRandomString () {
  while (true) {
    let r = Math.random().toString(36).substring(7)
    if (r.length === 6) {
      return r
    }
  }
}


//--------------------------------------------------------------------------
app.get("/user/:userid", (req, res) => {
  const userid = req.params.userid;
  // var userName = 'Bobo';
  // var userRank = null;
    //res.send(userid);
    knexQueries.matchesForUser(userid,function (data) {
          console.log(data);
          let user = userInformation(userid, data[0]);
          console.log(user);

          let templateVars = {data: data, user: user.userName, userRank: user.userRank, userid: user.userid};
          res.render("user_id",templateVars);

    });
});
//--------------------------------------------------
function userInformation(userid, row){
  let userName = row.name1;
  let userRank = row.rank1;

  if (userid ==row.id2){
    userName = row.name2;
    userRank = row.rank2;
  }
 return {userid: userid, userName: userName, userRank: userRank}
}




app.listen(PORT, '0.0.0.0', () => {
  console.log("Example app listening on port " + PORT);
});
