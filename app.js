const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const { isFunction } = require('util');
const port = 3001
http.listen(port, () => {
    console.log(`listening on : ${port}`);
});

// app.all('/', function (req, res, next) {
//     fs.readFile('socket.chat.html', function (error, result) {
//         res.writeHead(200, { 'Content-Type': 'text/html' });
//         res.end(result);
//     });
// });

// app.get('/', (req, res) => {
//     res.send("Node Server is running. Yay!!")
// })

var userrooms = {};
// var state = {};
var lobby = 'Lobby';

io.on('connection', function (socket) {
    console.log('hi')
    onjoin(socket);
    // onleave(socket);
    onCreateRoom(socket);
    onJoinRoom(socket);
    onGetRooms(socket);
    onSuccess(socket);
    onFail(socket);
    onReady(socket);
    // socket.on('message', function (result) {
    //     io.sockets.in(socket.room).emit('message', result);
    // });

    socket.on('disconnect', function () {
        console.log('disconnect');
        roomout(socket);
    });
});

function check_player(socket){
    if (userrooms[socket.room]!=undefined &&'players' in userrooms[socket.room] && socket.id in userrooms[socket.room].players)
        return;
    socket.disconnect();
}

function onReady(socket) {
    socket.on('Ready', function (data) {
        check_player(socket);
        userrooms[socket.room].players[socket.id] = !userrooms[socket.room].players[socket.id];
        io.sockets.in(socket.room).emit('Ready', [socket.id, userrooms[socket.room].players[socket.id]]);
        syncroompeople(socket.room);
        if (Object.keys(userrooms[socket.room].players).length == 2 && Object.values(userrooms[socket.room].players).every(x => x)){
            startGame(socket.room)
        }
    });
}

function onFail(socket) {
    socket.on('Fail', function (_) {
        check_player(socket);
        if (userrooms[socket.room].state == gamestate.Turn && userrooms[socket.room].turnid == socket.id)
            fail(socket.room, socket.id);
    });
}

function onSuccess(socket) {
    socket.on('Success', function (data) {
        const roomName = socket.room;
        check_player(socket);
        if (userrooms[roomName].state != gamestate.Turn || userrooms[roomName].turnid != socket.id)
            return;
        const preturnid = userrooms[roomName].turnid;
        for (const key in userrooms[roomName].players)
            if (preturnid != key)
                userrooms[roomName].turnid = key;
        userrooms[roomName].randpart();
        io.sockets.in(roomName).emit('Turn', [userrooms[roomName].turnid, userrooms[roomName].nowidx]);
        clearTimeout(userrooms[roomName].timeout);
        userrooms[roomName].timeout = gameTimeout(roomName);
    })
}

function syncroompeople(roomName) {
    array1 = Object.keys(userrooms[roomName].players);
    array2 = Object.keys(io.sockets.adapter.rooms[roomName].sockets);
    var is_same = (array1.length == array2.length) && array1.every(function (element, index) {
        return element === array2[index];
    });
    if (!is_same) {
        delete userrooms[roomName].players;
        userrooms[roomName].players = {};
        for (const key in io.sockets.adapter.rooms[roomName].sockets)
            userrooms[roomName].players[key] = false;
    }
}

function onJoinRoom(socket) {
    socket.on('JoinRoom', function (roomName) {
        const room = io.sockets.adapter.rooms[roomName];
        const roomexist = room != undefined && room.length < 2 && userrooms[roomName] != undefined && userrooms[roomName].state == gamestate.Wating;
        if (socket.rooms.length > 2) {
            socket.disconnect();
            roomout(socket);
        }
        if (roomexist) {
            syncroompeople(roomName);
            socket.leave(socket.room);
            socket.join(roomName);
            socket.room = roomName;
            userrooms[roomName].players[socket.id] = false;
            io.sockets.in(roomName).emit('JoinRoom', userrooms[roomName]);
        } else {
            io.to(socket.id).emit('FullRoom');
        }
    });
}

function onjoin(socket) {
    socket.on('join', function (result) {
        console.log(`join ${result}`);
        if (Object.keys(socket.rooms).length > 2) {
            socket.disconnect();
            roomout(socket);
        }
        socket.leave(socket.room);
        socket.join(result);
        roomout(socket);
        socket.room = result;
    });
}

function checkroomvalid() {
    const rooms = io.sockets.adapter.rooms;
    ischanged = false;
    for (const key in userrooms)
        if (!rooms.hasOwnProperty(key)) {
            delete userrooms[key];
            ischanged = true;
        }
    if (ischanged)
        io.sockets.in(lobby).emit('GetRooms', userrooms);
}

function onGetRooms(socket) {
    socket.on('GetRooms', function () {
        checkroomvalid();
        io.to(socket.id).emit('GetRooms', userrooms);
    });
}

function onCreateRoom(socket) {
    socket.on('CreateRoom', function (data) {
        if (data.roomName in userrooms)
            io.to(socket.id).emit('AlreadyExist');
        else {
            socket.leave(socket.room);
            socket.join(data.roomName);
            socket.room = data.roomName;
            data.rcode = 0;
            userrooms[data.roomName] = initGame(socket, data.difficulty, data.bodyparts);
            userrooms[data.roomName].roomName = data.roomName;


            io.to(socket.id).emit('CreateRoom', data.roomName);
            io.sockets.in(lobby).emit('GetRooms', userrooms);
        }
    });
}


gamestate = {
    Wating: 0,
    Start: 3,
    Turn: 60,
}

function roomout(socket) {
    const roomName = socket.room;
    if (userrooms[roomName] != undefined && socket.id in userrooms[roomName].players) {
        delete userrooms[roomName].players[socket.id];
        io.in(roomName).emit('Opponentleave');

        if (Object.keys(userrooms[socket.room].players).length == 0)
            delete userrooms[socket.room]
        else if ([gamestate.Start, gamestate.Turn].indexOf(userrooms[socket.room].state) != -1) {
            clearTimeout(userrooms[roomName].timeout);
            io.in(roomName).emit('loser', socket.id);
            userrooms[roomName].state = gamestate.Wating;
        }
    }
}

Bodyparts = [3, 4, 4, 4]// {upper:4,lower:4,whole:3,core:4}

function initGame(socket, _difficulty, _bodyparts) {
    _players = {};
    _players[socket.id] = false;
    return {
        players: _players,
        turnid: socket.id,
        state: gamestate.Wating,
        // resttime: 3,
        difficulty: _difficulty,
        bodyparts: _bodyparts,
        nowidx: 0,
        timeout: null,
        randpart: function () {
            len = 0;
            for (i in this.bodyparts) {
                len += Bodyparts[i]
            }
            this.nowidx = Math.floor(Math.random() * len)
        }
    }
}


const playtime = 60000;
function startGame(roomName) {
    userrooms[roomName].state = gamestate.Start;
    io.in(roomName).emit('Start');
    setTimeout(() => {
        if (userrooms[roomName] == undefined || Object.keys(userrooms[roomName].players).length < 2) return;
        userrooms[roomName].randpart();
        userrooms[roomName].turnid = Object.keys(userrooms[roomName].players)[0]
        for (const key in userrooms[roomName].players)
            userrooms[roomName].players[key] = false;
        userrooms[roomName].timeout = gameTimeout(roomName);
        userrooms[roomName].state = gamestate.Turn;
        io.in(roomName).emit('Turn', [userrooms[roomName].turnid, userrooms[roomName].nowidx]);
    }, 3000)
}

function gameTimeout(roomName) {
    const timeout = setTimeout(() => {
        fail(roomName);
        // const loser = userrooms[roomName].turnid;
    }, playtime);
    return timeout;
}

function fail(roomName, socketid = '') {
    clearTimeout(userrooms[roomName].timeout);
    if (socketid)
        io.in(roomName).emit('loser', socketid);
    else
        io.in(roomName).emit('loser', userrooms[roomName].turnid);
    userrooms[roomName].state = gamestate.Wating;
}