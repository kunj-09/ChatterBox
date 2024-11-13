const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

const app = express();

/***socket connection */
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
    },
});

/***
 * socket running at http://localhost:8080/
 */

// online user set to track connected users
const onlineUser = new Set();

io.on('connection', async (socket) => {
    console.log("connect User ", socket.id);

    const token = socket.handshake.auth.token;

    // current user details
    const user = await getUserDetailsFromToken(token);

    // If the user is not found or authenticated, disconnect the socket
    if (!user) {
        console.log("User not authenticated, disconnecting socket.");
        socket.disconnect(); // Disconnect the socket if no user is found
        return;
    }

    // create a room for the user based on their user ID
    socket.join(user._id.toString());
    onlineUser.add(user._id.toString());

    // Emit the updated list of online users
    io.emit('onlineUser', Array.from(onlineUser));

    // Handle the 'message-page' event to fetch user details and previous messages
    socket.on('message-page', async (userId) => {
        console.log('userId', userId);
        const userDetails = await UserModel.findById(userId).select("-password");

        const payload = {
            _id: userDetails?._id,
            name: userDetails?.name,
            email: userDetails?.email,
            profile_pic: userDetails?.profile_pic,
            online: onlineUser.has(userId),
        };
        socket.emit('message-user', payload);

        // get previous message
        const getConversationMessage = await ConversationModel.findOne({
            "$or": [
                { sender: user._id, receiver: userId },
                { sender: userId, receiver: user._id }
            ]
        }).populate('messages').sort({ updatedAt: -1 });

        socket.emit('message', getConversationMessage?.messages || []);
    });

    // Handle the 'new message' event to save and send new messages
    socket.on('new message', async (data) => {
        // Check if a conversation exists between the two users
        let conversation = await ConversationModel.findOne({
            "$or": [
                { sender: data?.sender, receiver: data?.receiver },
                { sender: data?.receiver, receiver: data?.sender }
            ]
        });

        // If conversation does not exist, create a new one
        if (!conversation) {
            const createConversation = await ConversationModel({
                sender: data?.sender,
                receiver: data?.receiver
            });
            conversation = await createConversation.save();
        }

        // Create a new message
        const message = new MessageModel({
            text: data.text,
            imageUrl: data.imageUrl,
            videoUrl: data.videoUrl,
            msgByUserId: data?.msgByUserId,
        });

        // Save the message
        const saveMessage = await message.save();

        // Update the conversation with the new message
        const updateConversation = await ConversationModel.updateOne({ _id: conversation?._id }, {
            "$push": { messages: saveMessage?._id }
        });

        // Fetch the updated conversation messages
        const getConversationMessage = await ConversationModel.findOne({
            "$or": [
                { sender: data?.sender, receiver: data?.receiver },
                { sender: data?.receiver, receiver: data?.sender }
            ]
        }).populate('messages').sort({ updatedAt: -1 });

        // Emit the updated messages to both the sender and receiver
        io.to(data?.sender).emit('message', getConversationMessage?.messages || []);
        io.to(data?.receiver).emit('message', getConversationMessage?.messages || []);

        // Fetch and emit updated conversations to the sender and receiver
        const conversationSender = await getConversation(data?.sender);
        const conversationReceiver = await getConversation(data?.receiver);

        io.to(data?.sender).emit('conversation', conversationSender);
        io.to(data?.receiver).emit('conversation', conversationReceiver);
    });

    // Handle the 'sidebar' event to fetch the current user's conversations
    socket.on('sidebar', async (currentUserId) => {
        console.log("current user", currentUserId);

        const conversation = await getConversation(currentUserId);

        socket.emit('conversation', conversation);
    });

    // Handle the 'seen' event to mark messages as seen
    socket.on('seen', async (msgByUserId) => {
        let conversation = await ConversationModel.findOne({
            "$or": [
                { sender: user._id, receiver: msgByUserId },
                { sender: msgByUserId, receiver: user._id }
            ]
        });

        const conversationMessageId = conversation?.messages || [];

        // Update messages as seen
        const updateMessages = await MessageModel.updateMany(
            { _id: { "$in": conversationMessageId }, msgByUserId: msgByUserId },
            { "$set": { seen: true } }
        );

        // Emit updated conversation to the sender and receiver
        const conversationSender = await getConversation(user._id.toString());
        const conversationReceiver = await getConversation(msgByUserId);

        io.to(user._id.toString()).emit('conversation', conversationSender);
        io.to(msgByUserId).emit('conversation', conversationReceiver);
    });

    // Handle disconnect event
    socket.on('disconnect', () => {
        onlineUser.delete(user._id.toString());
        console.log('disconnect user ', socket.id);
    });
});

module.exports = {
    app,
    server
};
