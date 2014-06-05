
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
            var sendAllButSpy = null;

            beforeEach(function(done) {
                sendAllButSpy = sinon.spy();
                peer.room = { sendAllBut: sendAllButSpy };

                done();
            });

            it('should change the name of the peer', function(done) {
                peer.onSetName({ name: 'foo' });

                peer.name.should.eql('foo');

                done();
            });

            it('should broadcast the name change to the room', function(done) {
                peer.id = 12345;
                peer.onSetName({ name: 'foo' });

                sendAllButSpy.calledOnce.should.be.true;
                sendAllButSpy.calledWith(peer, 'setName', { peer: 12345, name: 'foo' });

                done();
            });

            it('should do nothing when not in a room', function(done) {
                peer.room = null;
                peer.onSetName({ name: 'foo' });

                peer.name.should.eql('foo');
                sendAllButSpy.called.should.be.false;

                done();
            });
        });

        describe('onSendTo', function () {
            it('should send a message to the other user via the buoy', function(done) {
                peer.id = 76767;
                peer.buoy = { sendPeer: sinon.spy() };
                peer.onSendTo({ to: 'asdf', msg: 'foo' });

                peer.buoy.sendPeer.calledOnce.should.be.true;
                peer.buoy.sendPeer.calledWith('asdf', 'recvMessage', { from: 76767, msg: 'foo' });

                done();
            });
        });

        describe('onJoinRoom', function () {
            beforeEach(function(done) {
                peer.buoy = {
                    getRoom: sinon.stub().returns({
                        name: 'I like to eat yogurt',
                        join: sinon.spy()
                    })
                };

                done();
            });

            it('should set the room to the one specified', function(done) {
                peer.onJoinRoom({ roomName: 'I like to eat yogurt' });

                peer.buoy.getRoom.calledOnce.should.be.true;
                peer.buoy.getRoom.calledWith('I like to eat yogurt').should.be.true;
                peer.room.name.should.eql('I like to eat yogurt');

                done();
            });

            it('should join the peer to the room', function(done) {
                peer.onJoinRoom({ roomName: 'I like to eat yogurt' });

                peer.room.join.calledOnce.should.be.true;
                peer.room.join.calledWith(peer).should.be.true;

                done();
            });
        });

        describe('onLeaveRoom', function () {
            var room = null;

            beforeEach(function(done) {
                room = {
                    leave: sinon.stub()
                };

                peer.room = room;

                done();
            });

            it('should remove the peer from the room', function(done) {
                peer.onLeaveRoom();

                room.leave.calledOnce.should.be.true;
                room.leave.calledWith(peer).should.be.true;

                done();
            });

            it('should clear the room property of the peer', function(done) {
                peer.onLeaveRoom();

                (peer.room === null).should.be.true;

                done();
            });

            it('should do nothing when not in a room', function(done) {
                peer.room = null;
                peer.onLeaveRoom();

                room.leave.called.should.be.false;

                done();
            });
        });

        describe('onRequestDJ', function () {
            var room = null;

            beforeEach(function(done) {
                room = {
                    addDJ: sinon.stub()
                };

                peer.room = room;

                done();
            });

            it('should add the peer as a DJ', function(done) {
                peer.onRequestDJ();

                room.addDJ.calledOnce.should.be.true;
                room.addDJ.calledWith(peer).should.be.true;

                done();
            });

            it('should do nothing when not in a room', function(done) {
                peer.room = null;
                peer.onRequestDJ();

                room.addDJ.called.should.be.false;

                done();
            });
        });

        describe('onQuitDJ', function () {
            var room = null;

            beforeEach(function(done) {
                room = {
                    removeDJ: sinon.stub()
                };

                peer.room = room;

                done();
            });

            it('should remove the peer from its DJ spot', function(done) {
                peer.onQuitDJ();

                room.removeDJ.calledOnce.should.be.true;
                room.removeDJ.calledWith(peer).should.be.true;

                done();
            });

            it('should do nothin when not in a room', function(done) {
                peer.room = null;
                peer.onQuitDJ();

                room.removeDJ.called.should.be.false;

                done();
            });
        });

        describe('onSetGravatar', function () {
            var room = null;

            beforeEach(function(done) {
                room = {
                    sendAllBut: sinon.stub()
                };

                peer.room = room;

                done();
            });

            it('should modify the gravatar property of the peer', function(done) {
                peer.onSetGravatar({ gravatar: 'https://avatars1.githubusercontent.com/u/1425048?s=460' });

                peer.gravatar.should.eql('https://avatars1.githubusercontent.com/u/1425048?s=460');

                done();
            });

            it('should broadcast the gravatar change when in a room', function(done) {
                peer.onSetGravatar({ gravatar: 'https://avatars1.githubusercontent.com/u/1425048?s=460' });

                room.sendAllBut.calledOnce.should.be.true;
                room.sendAllBut.calledWith(peer, 'setGravatar', {
                    peer: peer.id,
                    gravatar: 'https://avatars1.githubusercontent.com/u/1425048?s=460'
                }).should.be.true;

                done();
            });

            it('should broadcast nothing when not in a room', function(done) {
                peer.room = null;
                peer.onSetGravatar({ gravatar: 'https://avatars1.githubusercontent.com/u/1425048?s=460' });

                room.sendAllBut.called.should.be.false;

                done();
            });
        });

        describe('onSetActiveTrack', function () {
            var track = null
              , getActiveDJStub = null
              , setActiveTrackStub = null;

            beforeEach(function(done) {
                track = { name: 'come on and slam', artist: 'if you wanna jam' };
                getActiveDJStub = sinon.stub().returns(peer);
                setActiveTrackStub = sinon.stub();
                peer.room = {
                    getActiveDJ: getActiveDJStub,
                    setActiveTrack: setActiveTrackStub
                };

                done();
            });

            it('should set the active track to the specified track', function(done) {
                peer.onSetActiveTrack({ track: track });

                getActiveDJStub.calledOnce.should.be.true;
                setActiveTrackStub.calledOnce.should.be.true;
                setActiveTrackStub.calledWith(track).should.be.true;

                done();
            });

            it('should do nothing when not in a room', function(done) {
                peer.room = null;
                peer.onSetActiveTrack({ track: track });

                setActiveTrackStub.called.should.be.false;

                done();
            });

            it('should do nothing when not the active DJ', function(done) {
                peer.room.getActiveDJ = sinon.stub().returns(null);
                peer.onSetActiveTrack({ track: track });

                setActiveTrackStub.called.should.be.false;

                done();
            });

            it('should do nothing when no track is sent', function(done) {
                peer.onSetActiveTrack({ track: null });

                setActiveTrackStub.called.should.be.false;

                done();
            });
        });

        describe('onSetActiveTrackDuration', function () {
            var getActiveDJStub = null
              , setActiveTrackDurationStub = null;

            beforeEach(function(done) {
                getActiveDJStub = sinon.stub().returns(peer);
                setActiveTrackDurationStub = sinon.stub();
                peer.room = {
                    getActiveDJ: getActiveDJStub,
                    setActiveTrackDuration: setActiveTrackDurationStub
                };

                done();
            });

            it('should set the active track duration to the specified duration', function(done) {
                peer.onSetActiveTrackDuration({ duration: 213374 });

                getActiveDJStub.calledOnce.should.be.true;
                setActiveTrackDurationStub.calledOnce.should.be.true;
                setActiveTrackDurationStub.calledWith(213374).should.be.true;

                done();
            });

            it('should do nothing when not in a room', function(done) {
                peer.room = null;
                peer.onSetActiveTrackDuration({ duration: 213374 });

                setActiveTrackDurationStub.calledOnce.should.be.false;

                done();
            });

            it('should do nothing when not the active DJ', function(done) {
                peer.room.getActiveDJ.returns({ name: 'not you' });
                peer.onSetActiveTrackDuration({ duration: 213374 });

                setActiveTrackDurationStub.calledOnce.should.be.false;

                done();
            });

            it('should do nothing when no duration is sent', function(done) {
                peer.onSetActiveTrackDuration({ derpation: 213374 });

                setActiveTrackDurationStub.calledOnce.should.be.false;

                done();
            });
        });

        describe('onSkip', function () {
            var getActiveDJStub = null
              , skipStub = null;

            beforeEach(function(done) {
                getActiveDJStub = sinon.stub().returns(peer);
                skipStub = sinon.stub();
                peer.room = {
                    getActiveDJ: getActiveDJStub,
                    skip: skipStub
                };

                done();
            });

            it('should skip the track', function(done) {
                peer.onSkip();

                peer.room.skip.calledOnce.should.be.true;

                done();
            });

            it('should do nothing when not in a room', function(done) {
                peer.room = null;
                peer.onSkip();

                skipStub.called.should.be.false;

                done();
            });

            it('should do nothing when not the active DJ', function(done) {
                peer.room.getActiveDJ.returns({ name: 'not you' });
                peer.onSkip();

                skipStub.called.should.be.false;

                done();
            });
        });

        describe('onSetVote', function () {
            var room = null;

            beforeEach(function(done) {
                room = {
                    activeTrack: { name: 'come on and slam' },
                    sendAllBut: sinon.stub()
                };

                peer.room = room;

                done();
            });

            it('should change the vote of the peer in the requested direction', function(done) {
                peer.onSetVote({ vote: -1 });
                peer.vote.should.eql(-1);

                peer.onSetVote({ vote: -9000 });
                peer.vote.should.eql(-1);

                peer.onSetVote({ vote: 1 });
                peer.vote.should.eql(1);

                peer.onSetVote({ vote: 9000 });
                peer.vote.should.eql(1);
                
                peer.onSetVote({ vote: 0 });
                peer.vote.should.eql(0);

                done();
            });

            it('should broadcast the vote to all peers except the originating peer', function(done) {
                peer.onSetVote({ vote: 9000 });

                room.sendAllBut.calledOnce.should.be.true;
                room.sendAllBut.calledWith(peer, 'setVote', { peer: peer.id, vote: 1 });

                done();
            });

            it('should do nothing if there is no track playing', function(done) {
                peer.room.activeTrack = null;
                peer.onSetVote({ vote: 9000 });

                room.sendAllBut.called.should.be.false;

                done();
            });
        });

        describe('onBuoyNewRoom', function () {
            it('should send the new room name to the client', function(done) {
                peer.send = sinon.spy();
                peer.onBuoyNewRoom({ room: { name: 'come on and slam' } });

                peer.send.calledOnce.should.be.true;
                peer.send.calledWith('newRoom', { name: 'come on and slam' }).should.be.true;

                done();
            });
        });

        describe('onBuoyDeleteRoom', function () {
            it('should send the deleted room name to the client', function(done) {
                peer.send = sinon.spy();
                peer.onBuoyDeleteRoom({ room: 'I am a room for sure' });

                peer.send.calledOnce.should.be.true;
                peer.send.calledWith('deleteRoom', { name: 'I am a room for sure' }).should.be.true;

                done();
            });
        });

    });
})();