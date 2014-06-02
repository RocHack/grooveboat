
var should = require('should')
  , sinon = require('sinon')
  , Peer = require('../../server/peer').Peer;

(function() {
    'use strict';

    describe('Peer', function () {
        var peer = null
          , buoy = null
          , conn = null;

        beforeEach(function(done) {
            buoy = { 
                on: sinon.stub(),
                removeListener: sinon.spy()
            };
            conn = {
                sendJSON: sinon.spy()
            };

            peer = new Peer(buoy, conn);

            done();
        });

        describe('constructor', function () {
            it('should set properties with default and passed values', function(done) {
                peer = new Peer(buoy, 'bar');

                peer.should.have.property('buoy');
                peer.should.have.property('conn');
                peer.should.have.property('room');
                peer.should.have.property('name');
                peer.should.have.property('gravatar');
                peer.should.have.property('vote');

                peer.buoy.should.eql(buoy);
                peer.conn.should.eql('bar');
                (peer.room === null).should.be.true;
                peer.name.should.eql('Anon');
                (peer.gravatar === null).should.be.true;
                peer.vote.should.eql(0);

                done();
            });

            it('should attach listeners to all known events', function(done) {
                peer.listeners('ping').should.eql([peer.onPing]);
                peer.listeners('sendTo').should.eql([peer.onSendTo]);
                peer.listeners('joinRoom').should.eql([peer.onJoinRoom]);
                peer.listeners('leaveRoom').should.eql([peer.onLeaveRoom]);
                peer.listeners('sendChat').should.eql([peer.onSendChat]);
                peer.listeners('setName').should.eql([peer.onSetName]);
                peer.listeners('requestDJ').should.eql([peer.onRequestDJ]);
                peer.listeners('quitDJ').should.eql([peer.onQuitDJ]);
                peer.listeners('setGravatar').should.eql([peer.onSetGravatar]);
                peer.listeners('setActiveTrack').should.eql([peer.onSetActiveTrack]);
                peer.listeners('setActiveTrackDuration').should.eql([peer.onSetActiveTrackDuration]);
                peer.listeners('skip').should.eql([peer.onSkip]);
                peer.listeners('setVote').should.eql([peer.onSetVote]);

                done();
            });

            it('should attach listeners to buoy events', function(done) {
                buoy.on.getCall(0).args[0].should.eql('newRoom');
                buoy.on.getCall(0).args[1].should.eql(peer.onBuoyNewRoom);
                buoy.on.getCall(1).args[0].should.eql('deleteRoom');
                buoy.on.getCall(1).args[1].should.eql(peer.onBuoyDeleteRoom);

                done();
            });
        });

        describe('cleanUp', function () {
            it('should remove itself from its room', function (done) {
                peer.room = { leave: sinon.spy() };
                peer.cleanUp();

                peer.room.leave.calledOnce.should.be.true;
                peer.room.leave.calledWith(peer).should.be.true;

                done();
            });

            it('should unattach itself from its buoy\'s events', function (done) {
                peer.cleanUp();

                buoy.removeListener.getCall(0).args[0].should.eql('newRoom');
                buoy.removeListener.getCall(0).args[1].should.eql(peer.onBuoyNewRoom);
                buoy.removeListener.getCall(1).args[0].should.eql('deleteRoom');
                buoy.removeListener.getCall(1).args[1].should.eql(peer.onBuoyDeleteRoom);

                done();
            });
        });

        describe('send', function() {
            it('should only send the event name when no data is given', function (done) {
                peer.send('foo', null);

                conn.sendJSON.calledOnce.should.be.true;
                conn.sendJSON.calledWith({ e: 'foo' }).should.be.true;

                done();
            });

            it('should merge all data into the message object', function (done) {
                peer.send('an_event', { foo: 'foo', bar: 'bar', baz: 'baz' });

                conn.sendJSON.calledOnce.should.be.true;
                conn.sendJSON.calledWith({ e: 'an_event', foo: 'foo', bar: 'bar', baz: 'baz' }).should.be.true;

                done();
            });
        });

        describe('onPing', function () {
            it('should just send a pong message', function (done) {
                var sendSpy = sinon.spy(peer, 'send');
                peer.onPing();

                sendSpy.calledOnce.should.be.true;
                sendSpy.calledWith('pong').should.be.true;

                done();
            });
        });

        describe('onSendChat', function () {
            it('should broadcast message to the room', function (done) {
                var sendChatSpy = sinon.spy();
                peer.room = { sendChat: sendChatSpy };
                peer.onSendChat({ msg: 'foo' });

                sendChatSpy.calledOnce.should.be.true;
                peer.room.sendChat.calledWith(peer, 'foo').should.be.true;

                done();
            });

            it('should do nothing when not in a room', function (done) {
                var sendChatSpy = sinon.spy();
                peer.room = null;
                peer.onSendChat({ msg: 'foo' });

                sendChatSpy.called.should.be.false;

                done();
            });
        });

        describe('onSetName', function () {
            it('should change the name of the peer');
            it('should broadcast the name change to the room');
            it('should do nothing when not in a room');
        });

        describe('onSendTo', function () {
            it('should send a message to the other user via the buoy');
        });

        describe('onJoinRoom', function () {
            it('should set the room to the one specified');
            it('should join the peer to the room');
        });

        describe('onLeaveRoom', function () {
            it('should remove the peer from the room');
            it('should clear the room property of the peer');
            it('should do nothing when not in a room');
        });

        describe('onRequestDJ', function () {
            it('should add the peer as a DJ');
            it('should do nothing when not in a room');
        });

        describe('onQuitDJ', function () {
            it('should remove the peer from its DJ spot');
            it('should do nothin when not in a room');
        });

        describe('onSetGravatar', function () {
            it('should modify the gravatar property of the peer');
            it('should broadcast the gravatar change when in a room');
            it('should broadcast nothing when not in a room');
        });

        describe('onSetActiveTrack', function () {
            it('should set the active track to the specified track');
            it('should do nothing when not in a room');
            it('should do nothing when not the active DJ');
            it('should do nothing when no track is sent');
        });

        describe('onSetActiveTrackDuration', function () {
            it('should set the active track duration to the specified duration');
            it('should do nothing when not in a room');
            it('should do nothing when not the active DJ');
            it('should do nothing when no duration is sent');
        });

        describe('onSkip', function () {
            it('should skip the track');
            it('should do nothing when not in a room');
            it('should do nothing when not the active DJ');
        });

        describe('onSetVote', function () {
            it('should change the vote of the peer in the requested direction');
            it('should broadcast the vote to all peers except the originating peer');
            it('should do nothing if there is no track playing');
        });

        describe('onBuoyNewRoom', function () {
            it('should send the new room name to the client');
        });

        describe('onBuoyDeleteRoom', function () {
            it('should send the deleted room name to the client');
        });

    });
})();