const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');

const {generateMessage, generateLocationMessage} = require('./utils/message');
const {isRealString, isAlphanumeric} = require('./utils/validation');
const {Users} = require('./utils/users');
const {Rooms} = require('./utils/rooms');
const {ecr, dcr, base64Encode, base64Decode} = require('./utils/crypto');

const publicPath = path.join(__dirname, '../public');
const port = process.env.PORT || 5000;
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var users = new Users();
var rooms = new Rooms();

app.use(express.static(publicPath));
app.use(express.json());
app.use(express.urlencoded());
app.post('/create', (req, res) => {
    var rawData = JSON.parse(JSON.stringify(req.body));
    var data = {
        name: rawData.name,
        room: rawData.room,
        method: 'create'
    }
    var encryptQueryString = base64Encode(ecr(data).toString());
    if (data.name.length === 0 || data.room.length === 0) {
        res.redirect('/join.html?error=empty&method=create');
    }
    if (!isRealString(data.name) || !isRealString(data.room)) {
        res.redirect('/join.html?error=string&method=create');
    }
    if (!isAlphanumeric(data.name) || !isAlphanumeric(data.room)) {
        res.redirect('/join.html?error=alpha&method=create');
    }
    if (rooms.getRoomList().includes(data.room)) {
        res.redirect('/join.html?error=exist&method=create');
    } 
    else {
        res.redirect(`/chat.html?method=create&token=${encryptQueryString}`);
    }
});
app.post('/join', (req, res) => {
    var rawData = JSON.parse(JSON.stringify(req.body));
    var data = {
        name: rawData.name,
        room: rawData.room,
        method: 'join'
    }
    var encryptQueryString = base64Encode(ecr(data).toString());
    if (data.name.length === 0 || data.room.length === 0) {
        res.redirect('/join.html?error=empty&method=join');
        res.end();

    }
    if (!isRealString(data.name) || !isRealString(data.room)) {
        res.redirect('/join.html?error=string&method=join');
        res.end();

    }
    if (!isAlphanumeric(data.name) || !isAlphanumeric(data.room)) {
        res.redirect('/join.html?error=alpha&method=join');
        res.end();

    }
    if (!rooms.getRoomList().includes(data.room)) {
        res.redirect('/join.html?error=noroom&method=join');
        res.end();

    }
    else {
        res.redirect(`/chat.html?method=join&token=${encryptQueryString}`);
        res.end();
    }
});

io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('join', (params, callback) => {
        // if (users.getUserList(params.room).includes(params.name)) {
        //     return callback('This name has already taken');
        // }
        try {
            const token = dcr(base64Decode(params));
            if (token.method === 'join') {
                socket.join(token.room);
                users.removeUser(socket.id);
                users.addUser(socket.id, token.name, token.room);

                io.to(token.room).emit('updateUserList', users.getUserList(token.room));
                socket.emit('newMessage', generateMessage('Admin', 'welcome to RSA chat'));
                socket.broadcast.to(token.room).emit('newMessage', generateMessage('Admin', `${token.name} has joined`));
                console.log(token.name + " " + token.room);
                callback(token.room, false);
            }
        } catch (e) {
            var user = users.removeUser(socket.id);
            if (user) {
                var numberOfUser = (users.getUserList(user.room)).length;
                io.to(user.room).emit('updateUserList', users.getUserList(user.room));
                if (numberOfUser === 0) {
                    rooms.removeRoom(user.room);
                }
            }
            callback('err', true);
            console.log(rooms.getRoomList());
        }
    });
    socket.on('create', (params, callback) => {
        try {
            const token = dcr(base64Decode(params));
            console.log(token);
            if (token.method === 'create') {
                rooms.addRoom(token.room);
                socket.join(token.room);
                users.removeUser(socket.id);
                users.addUser(socket.id, token.name, token.room);
                io.to(token.room).emit('updateUserList', users.getUserList(token.room));
                socket.emit('newMessage', generateMessage('Admin', 'welcome to RSA chat'));
                socket.broadcast.to(token.room).emit('newMessage', generateMessage('Admin', `${token.name} has joined`));
                callback(token.room, false);
            }
        } catch(err) {
            // console.log(err);
            var user = users.removeUser(socket.id);
            if (user) {
                var numberOfUser = (users.getUserList(user.room)).length;
                io.to(user.room).emit('updateUserList', users.getUserList(user.room));
                if (numberOfUser === 0) {
                    rooms.removeRoom(user.room);
                }
            }
            console.log(rooms.getRoomList());
            callback('err', true);
        }
    });
    socket.on('createMessage', (message, callback) => {
        var user = users.getUser(socket.id);

        if (user && isRealString(message.text)) {
            io.to(user.room).emit('newMessage', generateMessage(user.name, message.text));
        }
        callback();
    });
    socket.on('createLocationMessage', (coords) => {
        var user = users.getUser(socket.id);

        if (user) {
            io.to(user.room).emit('newLocationMessage', generateLocationMessage(user.name, coords.latitude, coords.longitude));
        }
    });
    socket.on('disconnect', () => {
        var user = users.removeUser(socket.id);

        if (user) {
            // var room = rooms.removeRoom(user.room);
            var numberOfUser = (users.getUserList(user.room)).length;
            io.to(user.room).emit('updateUserList', users.getUserList(user.room));
            io.to(user.room).emit('newMessage', generateMessage('Admin', `${user.name} has left.`));
            if (numberOfUser === 0) {
                rooms.removeRoom(user.room);
            }
        }
    });
});

server.listen(port, () => {
    console.log(`Server is up on ${port}`);
});
