var express = require('express');
var app = express();
var fs = require('fs');
var open = require('open');
var options = {
  key: fs.readFileSync('./fake-keys/privatekey.pem'),
  cert: fs.readFileSync('./fake-keys/certificate.pem')
};
var serverPort = (process.env.PORT  || 4443);
var https = require('https');
var http = require('http');
var server;
if (process.env.LOCAL) {
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}
var io = require('socket.io')(server);

const connectedUsersRoom = 'connectedUsers';
var connectedUsers = {};

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});
server.listen(serverPort, function(){
  if (process.env.LOCAL) {
    open('https://localhost:' + serverPort)
  }
});

function socketIdsInRoom(name) {
  var socketIds = io.nsps['/'].adapter.rooms[name];
  if (socketIds) {
    var collection = [];
    for (var key in socketIds) {
      collection.push(key);
    }
    return collection;
  } else {
    return [];
  }
}

io.on('connection', function(socket){

  var userId = socket.handshake.query['userId'];
  connectedUsers[userId] = socket.id;
  io.to(connectedUsersRoom).emit('connectedUser', userId);
  socket.join(connectedUsersRoom);

  socket.on('disconnect', function(){
    delete connectedUsers[userId];
    io.to(connectedUsersRoom).emit('disconnectedUser', userId);
    socket.leave(connectedUsersRoom);

    var rooms = io.nsps['/'].adapter.rooms;
    for (const room in rooms) {
      if (room !== connectedUsersRoom) {
        io.to(room).emit('leave', socket.id);
        socket.leave(room);
      }
    }
  });

  socket.on('join', function(name, callback){
    var socketIds = socketIdsInRoom(name);
    callback(socketIds);
    socket.join(name);
  });

  socket.on('initiateCall', function(data) {
    data.from = socket.id;
    var calledUserId = data.to;
    var calledSocketId = connectedUsers[calledUserId];
    if (calledUserId) { // user is inside app
      var to = io.sockets.connected[calledSocketId];
      to.emit('callRequest', data);
    } else {
      // send push notification
    }
  });

  socket.on('callResponse', function(data) {
    var callerSocket = io.sockets.connected[data.callerSocketId];
    data.from = socket.id;
    if (data.accepted) {
      callerSocket.join(data.roomId);
      socket.join(data.roomId);
    }
    callerSocket.emit('callResponse', data);
  });

  socket.on('endCall', function(data) {
    var socketId = connectedUsers[data.userId];
    var to = io.sockets.connected[socketId];
    data.from = socket.id;
    to.emit('callEnded', data);
  });

  socket.on('offer', function(data) {
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('offer', data);
  });

  socket.on('answer', function(data) {
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('answer', data);
  });

  socket.on('candidate', function(data) {
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('candidate', data);
  });

});
