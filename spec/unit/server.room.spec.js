
var should = require('should')
  , sinon = require('sinon')
  , Room = require('../../server/room').Room;

(function() {
    'use strict';

    describe('Room', function() {
        var room = null;

        describe('constructor', function() {
            it('should set properties with default and passed values', function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');

                room.buoy.should.eql({ data: 'I am definitely a buoy guys' });
                room.name.should.eql('chillout');
                room.peers.should.be.empty;
                room.djs.should.be.empty;
                room.activeDJ.should.eql(-1);
                (room.activeTrack === null).should.be.true;
                (room.trackStartTime === null).should.be.true;

                done();
            });
        });

        describe('join', function() {
            var peer = null
              , sendAllButSpy = null
              , sendStub = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                sendAllButSpy = sinon.spy(room, 'sendAllBut');
                sendStub = sinon.stub();
                peer = {
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sendStub
                };

                done();
            });

            it('should add the peer to the list of peers', function(done) {
                room.join(peer);

                room.peers.should.eql([peer]);

                done();
            });

            it('should broadcast that the peer joined to all clients except the peer', function(done) {
                var peerA = {
                        id: '10',
                        name: 'asdf',
                        gravatar: 'http://gravatar.com/asdf',
                        vote: -1,
                        send: sinon.stub()
                    }
                  , peerB = {
                        id: '100',
                        name: 'fdsa',
                        gravatar: 'http://gravatar.com/fdsa',
                        vote: 1,
                        send: sinon.stub()
                    };

                room.peers.push(peerA);
                room.peers.push(peerB);
                room.join(peer);

                sendAllButSpy.calledOnce.should.be.true;
                sendAllButSpy.calledWith(peer, 'peerJoined').should.be.true;
                peerA.send.calledOnce.should.be.true;
                peerB.send.calledOnce.should.be.true;
                peer.send.calledAfter(peerA.send).should.be.true;
                peer.send.calledAfter(peerB.send).should.be.true;

                done();
            });

            it('should send the room data to the peer', function(done) {
                var peerA = {
                        id: '10',
                        name: 'asdf',
                        gravatar: 'http://gravatar.com/asdf',
                        vote: -1,
                        send: sinon.stub()
                    }
                  , peerB = {
                        id: '100',
                        name: 'fdsa',
                        gravatar: 'http://gravatar.com/fdsa',
                        vote: 1,
                        send: sinon.stub()
                    };

                room.peers.push(peerA);
                room.peers.push(peerB);
                room.join(peer);

                sendStub.calledWith('roomData', {
                    name: 'chillout',
                    activeDJ: -1,
                    activeTrack: null,
                    currentTime: null,
                    djs: [],
                    peers: [{ 
                        id: '10',
                        name: 'asdf',
                        gravatar: 'http://gravatar.com/asdf',
                        votes: -1
                    }, {
                        id: '100',
                        name: 'fdsa',
                        gravatar: 'http://gravatar.com/fdsa',
                        votes: 1
                    }, {
                        id: '1',
                        name: 'hola',
                        gravatar: 'http://gravatar.com/hola',
                        votes: 0
                    }]
                }).should.be.true;

                done();
            });

            it('should do nothing when the peer is null', function(done) {
                room.join(null);

                room.peers.should.be.empty;
                sendAllButSpy.called.should.be.false;
                peer.send.called.should.be.false;

                done();
            });
        });

        describe('leave', function() {
            var peers = null
              , removeDJSpy = null
              , deleteRoomStub = null
              , sendAllButSpy = null;

            beforeEach(function(done) {
                deleteRoomStub = sinon.stub();
                room = new Room({ deleteRoom: deleteRoomStub }, 'chillout');
                removeDJSpy = sinon.spy(room, 'removeDJ');
                sendAllButSpy = sinon.spy(room, 'sendAllBut');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }];

                done();
            });

            it('should remove the peer from the list of known peers', function(done) {
                var peer1 = peers[0]
                  , peer2 = peers[1]
                  , peer3 = peers[2];

                room.peers = peers;
                room.leave(peer2);

                room.peers.length.should.eql(2);
                room.peers.indexOf(peer1).should.eql(0);
                room.peers.indexOf(peer2).should.eql(-1);
                room.peers.indexOf(peer3).should.eql(1);

                done();
            });

            it('should do nothing when the given peer is not in the room', function(done) {
                var lessPeers = [peers[0], peers[2]];

                room.peers = lessPeers;
                room.leave(peers[1]);

                room.peers.length.should.eql(lessPeers.length);
                room.peers.indexOf(peers[0]).should.eql(0);
                room.peers.indexOf(peers[2]).should.eql(1);

                done();
            });

            it('should try to remove the peer as an active DJ', function(done) {
                var peer = peers[1];

                room.peers = peers;
                room.leave(peer);

                removeDJSpy.calledOnce.should.be.true;
                removeDJSpy.calledWith(peer).should.be.true;

                done();
            });

            it('should try to delete the room if this was the only peer in the room', function(done) {
                var evenLessPeers = [peers[1]];

                room.peers = evenLessPeers;
                room.leave(peers[1]);

                deleteRoomStub.calledOnce.should.be.true;
                deleteRoomStub.calledWith('chillout').should.be.true;

                done();
            });

            it('should not try to delete the room if there are more peers left', function(done) {
                var lessPeers = [peers[0], peers[2]];

                room.peers = lessPeers;
                room.leave(peers[0]);

                deleteRoomStub.called.should.be.false;

                done();
            });

            it('should broadcast a peerLeft message to all connected peers', function(done) {
                room.peers = [peers[0], peers[1], peers[2]];
                room.leave(peers[1]);

                sendAllButSpy.calledOnce.should.be.true;
                sendAllButSpy.calledWith(peers[1], 'peerLeft', { id: '10' }).should.be.true;

                done();
            });
        });

        describe('sendChat', function() {
            var peers = null
              , sendAllButSpy = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                sendAllButSpy = sinon.spy(room, 'sendAllBut');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }];

                done();
            });

            it('should send the chat message to all peers except the one that initiated it', function(done) {
                room.peers = peers;
                room.sendChat(peers[2], 'sup foos');

                sendAllButSpy.calledOnce.should.be.true;
                sendAllButSpy.calledWith(peers[2], 'chat', { msg: 'sup foos', from: '100' });

                done();
            });
        });

        describe('sendAll', function() {
            var peers = null
              , sendStub = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                sendStub = sinon.stub();
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sendStub
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sendStub
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sendStub
                }];

                done();
            });

            it('should send the given event and data to all known peers', function(done) {
                room.peers = peers;
                room.sendAll('foo', { bar: 'baz' });

                sendStub.callCount.should.eql(peers.length);
                sendStub.alwaysCalledWith('foo', { bar: 'baz' }).should.be.true;

                done();
            });
        });

        describe('sendAllBut', function() {
            var peers = null
              , sendStub = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                sendStub = sinon.stub();
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sendStub
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sendStub
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sendStub
                }];

                done();
            });

            it('should send the given event and data to all known peers except the given peer', function(done) {
                room.peers = peers;
                room.sendAllBut(peers[1], 'foo', { bar: 'baz' });

                sendStub.callCount.should.eql(peers.length - 1);
                sendStub.alwaysCalledWith('foo', { bar: 'baz' }).should.be.true;

                done();
            });
        });

        describe('addDJ', function() {
            var peers = null
              , sendAllSpy = null
              , setActiveDJSpy = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                sendAllSpy = sinon.spy(room, 'sendAll');
                setActiveDJSpy = sinon.spy(room, 'setActiveDJ');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }, {
                    id: '1000',
                    name: 'lkjk',
                    gravatar: 'http://gravatar.com/lkjk',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10000',
                    name: 'poiuy',
                    gravatar: 'http://gravatar.com/poiuy',
                    vote: 0,
                    send: sinon.stub()
                }]; 

                done();
            });

            it('should add the peer as a DJ', function(done) {
                room.addDJ(peers[1]);

                room.djs.length.should.eql(1);

                done();
            });

            it('should send a newDJ event to all peers', function(done) {
                room.peers = peers;
                room.addDJ(peers[1]);

                sendAllSpy.called.should.be.true;
                sendAllSpy.calledWith('newDJ', { id: '10' }).should.be.true;

                done();
            });

            it('should automatically make the peer a DJ if it is the last DJ left', function(done) {
                room.peers = peers;
                room.addDJ(peers[1]);

                setActiveDJSpy.calledOnce.should.be.true;
                setActiveDJSpy.calledWith(peers[1]).should.be.true;

                room.addDJ(peers[2]);

                setActiveDJSpy.calledTwice.should.be.false;

                done();
            });

            it('should do nothing if the peer is already a DJ', function(done) {
                room.peers = peers;
                room.djs = [peers[0]];
                room.addDJ(peers[0]);

                room.djs.length.should.eql(1);
                sendAllSpy.called.should.be.false;

                done();
            });

            it('should do nothing if all the DJ slots are already full', function(done) {
                room.peers = peers;
                room.djs = peers;
                var result = room.addDJ({ id: '100000', name: 'fhwofh' });

                room.djs.length.should.eql(5);
                result.should.be.false;

                done();
            });
        });

        describe('removeDJ', function() {
            var peers = null
              , sendAllSpy = null
              , skipSpy = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                sendAllSpy = sinon.spy(room, 'sendAll');
                skipSpy = sinon.spy(room, 'skip');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }, {
                    id: '1000',
                    name: 'lkjk',
                    gravatar: 'http://gravatar.com/lkjk',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10000',
                    name: 'poiuy',
                    gravatar: 'http://gravatar.com/poiuy',
                    vote: 0,
                    send: sinon.stub()
                }]; 

                done();
            });

            it('should remove the peer from the list of active DJs', function(done) {
                room.djs = [peers[3]];
                room.removeDJ(peers[3]);

                room.djs.length.should.eql(0);

                done();
            });

            it('should send a removeDJ event to all peers', function(done) {
                room.peers = peers;
                room.djs = [peers[3]];
                room.removeDJ(peers[3]);

                sendAllSpy.called.should.be.true;
                sendAllSpy.calledWith('removeDJ', { id: '1000' }).should.be.true;

                done();
            });

            it('should skip the active track if the leaving peer was the active DJ', function(done) {
                room.djs = [peers[0], peers[1], peers[2]];
                room.activeDJ = 2;
                room.removeDJ(peers[2]);

                skipSpy.calledOnce.should.be.true;

                done();
            });

            it('should update the index of the active DJ correctly', function(done) {
                room.djs = [peers[0], peers[1], peers[2]];
                room.activeDJ = 2;
                room.removeDJ(peers[1]);

                room.activeDJ.should.eql(1);

                room.activeDJ = 0;
                room.removeDJ(peers[1]);

                room.activeDJ.should.eql(0);

                done();
            });

            it('should do nothing if the peer is not a DJ', function(done) {
                room.djs = [peers[0], peers[1]];
                room.removeDJ(peers[2]);

                room.djs.length.should.eql(2);
                sendAllSpy.called.should.be.false;

                done();
            });
        });

        describe('setActiveDJ', function() {
            var peers = null
              , sendAllSpy = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                sendAllSpy = sinon.spy(room, 'sendAll');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }, {
                    id: '1000',
                    name: 'lkjk',
                    gravatar: 'http://gravatar.com/lkjk',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10000',
                    name: 'poiuy',
                    gravatar: 'http://gravatar.com/poiuy',
                    vote: 0,
                    send: sinon.stub()
                }]; 

                done();
            });

            it('should set the active DJ index to the index of the given peer', function(done) {
                room.djs = [peers[0], peers[2], peers[3]];
                room.setActiveDJ(peers[2]);

                room.activeDJ.should.eql(1);

                done();
            });

            it('should broadcast an active DJ event to all peers', function(done) {
                room.djs = [peers[0], peers[2], peers[3]];
                room.peers = peers;
                room.setActiveDJ(peers[2]);

                sendAllSpy.calledOnce.should.be.true;
                sendAllSpy.calledWith('setActiveDJ', { peer: '100' });

                done();
            });

            it('should broadcast null if the peer was not a DJ or is null', function(done) {
                room.djs = [peers[0], peers[2], peers[3]];
                room.peers = peers;
                room.setActiveDJ(peers[1]);

                sendAllSpy.calledOnce.should.be.true;
                sendAllSpy.calledWith('setActiveDJ', { peer: null });

                done();
            });

            it('should broadcast null if the peer is null', function(done) {
                room.djs = [peers[0], peers[2], peers[3]];
                room.peers = peers;
                room.setActiveDJ(null);

                sendAllSpy.calledOnce.should.be.true;
                sendAllSpy.calledWith('setActiveDJ', { peer: null });

                done();
            });
        });

        describe('skip', function() {
            var peers = null
              , setActiveTrackSpy = null
              , setActiveDJSpy = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                setActiveTrackSpy = sinon.spy(room, 'setActiveTrack');
                setActiveDJSpy = sinon.spy(room, 'setActiveDJ');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }, {
                    id: '1000',
                    name: 'lkjk',
                    gravatar: 'http://gravatar.com/lkjk',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10000',
                    name: 'poiuy',
                    gravatar: 'http://gravatar.com/poiuy',
                    vote: 0,
                    send: sinon.stub()
                }]; 

                done();
            });

            it('should clear the active track', function(done) {
                room.activeTrack = { title: 'foo', artist: 'bar' };
                room.skip();

                setActiveTrackSpy.calledOnce.should.be.true;
                setActiveTrackSpy.calledWith(null).should.be.true;

                done();
            });

            it('should cycle to the next DJ in the rotation', function(done) {
                room.activeTrack = { title: 'foo', artist: 'bar' };
                room.djs = [peers[0], peers[2], peers[3]];
                room.activeDJ = 1;
                room.skip();

                setActiveDJSpy.calledOnce.should.be.true;
                setActiveDJSpy.calledWith(peers[3]).should.be.true;
                room.activeDJ.should.eql(2);

                done();
            });

            it('should avoid race conditions between skipping the track and setting the active DJ', function(done) {
                room.activeTrack = { title: 'foo', artist: 'bar' };
                room.djs = [peers[0], peers[2], peers[3]];
                room.activeDJ = 1;
                room.getActiveDJ = sinon.stub().returns(peers[3]);
                room.skip();

                setActiveDJSpy.calledOnce.should.be.true;
                setActiveDJSpy.calledWith(null).should.be.true;
                room.activeDJ.should.eql(-1);

                done();
            });

            it('should prevent the track from being skipped too soon after the race condition is evaded', function(done) {
                room.activeTrack = { title: 'foo', artist: 'bar' };
                room.djs = [peers[0], peers[2], peers[3]];
                room.activeDJ = 1;
                room.getActiveDJ = sinon.stub().returns(peers[3]);
                room.skip();
                room.skip();

                setActiveTrackSpy.calledTwice.should.be.false;
                setActiveDJSpy.calledTwice.should.be.false;

                // Commented out since this more than doubles the test suite execution time
                // setTimeout(function() {
                //     setActiveTrackSpy.calledTwice.should.be.true;
                //     setActiveDJSpy.calledTwice.should.be.true;

                //     done();
                // }, 250);

                done();
            });
        });

        describe('getActiveDJ', function() {
            var peers = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }]; 

                done();
            });

            it('should always return the currently active DJ', function(done) {
                room.djs = [peers[0], peers[2], peers[1]];
                room.activeDJ = 2;

                room.getActiveDJ().should.eql(peers[1]);

                done();
            });
        });

        describe('setActiveTrack', function() {
            var peers = null
              , track = null
              , sendAllSpy = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                track = { title: 'foo', artist: 'bar' };
                sendAllSpy = sinon.spy(room, 'sendAll');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }, {
                    id: '1000',
                    name: 'lkjk',
                    gravatar: 'http://gravatar.com/lkjk',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10000',
                    name: 'poiuy',
                    gravatar: 'http://gravatar.com/poiuy',
                    vote: 0,
                    send: sinon.stub()
                }]; 

                done();
            });

            it('should set the active track to the given one', function(done) {
                room.setActiveTrack(track);

                room.activeTrack.should.eql(track);

                done();
            });

            it('should send a setActiveTrack event to all peers', function(done) {
                room.setActiveTrack(track);

                sendAllSpy.calledOnce.should.be.true;
                sendAllSpy.calledWith('setActiveTrack', { track: track }).should.be.true;

                done();
            });

            it('should clear the vote of every peer', function(done) {
                room.peers = [peers[1], peers[2]];
                room.setActiveTrack(track);

                peers[1].vote.should.eql(0);
                peers[2].vote.should.eql(0);

                done();
            });

            it('should reset the trackStartTime', function(done) {
                room.setActiveTrack(track);

                room.trackStartTime.should.be.ok;

                done();
            });

            it('should clear the trackStartTime if the track is null', function(done) {
                room.setActiveTrack(null);

                (room.trackStartTime === null).should.be.true;

                done();
            });
        });

        describe('setActiveTrackDuration', function() {
            var peers = null
              , track = null
              , sendAllSpy = null;

            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');
                track = { title: 'foo', artist: 'bar' };
                sendAllSpy = sinon.spy(room, 'sendAll');
                peers = [{
                    id: '1',
                    name: 'hola',
                    gravatar: 'http://gravatar.com/hola',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10',
                    name: 'asdf',
                    gravatar: 'http://gravatar.com/asdf',
                    vote: -1,
                    send: sinon.stub()
                }, {
                    id: '100',
                    name: 'fdsa',
                    gravatar: 'http://gravatar.com/fdsa',
                    vote: 1,
                    send: sinon.stub()
                }, {
                    id: '1000',
                    name: 'lkjk',
                    gravatar: 'http://gravatar.com/lkjk',
                    vote: 0,
                    send: sinon.stub()
                }, {
                    id: '10000',
                    name: 'poiuy',
                    gravatar: 'http://gravatar.com/poiuy',
                    vote: 0,
                    send: sinon.stub()
                }]; 

                done();
            });

            it('should set the active track duration to the given duration', function(done) {
                room.activeTrack = track;
                room.setActiveTrackDuration(500);

                room.activeTrack.duration.should.eql(500);

                done();
            });

            it('should send a setDuration event to all peers', function(done) {
                room.activeTrack = track;
                room.setActiveTrackDuration(500);

                sendAllSpy.calledOnce.should.be.true;
                sendAllSpy.calledWith('setDuration', { duration: 500 });

                done();
            });

            it('should do nothing when there is no active track', function(done) {
                room.setActiveTrackDuration(500);

                sendAllSpy.calledOnce.should.be.false;

                done();
            });
        });

        describe('getCurrentTime', function() {
            beforeEach(function(done) {
                room = new Room({ data: 'I am definitely a buoy guys' }, 'chillout');

                done();
            });

            it('should return the difference between the current time and the track start time', function(done) {
                room.trackStartTime = new Date(2014, 2, 24);
                var timeDiff = room.getCurrentTime();

                timeDiff.should.be.a.Number;

                done();
            });

            it('should return null when the trackStartTime is not set', function(done) {
                var timeDiff = room.getCurrentTime();

                (timeDiff === null).should.be.true;

                done();
            });
        });
    });
})();