
var should = require('should')
  , sinon = require('sinon')
  , Buoy = require('../../server/buoy').Buoy;

(function() {
    'use strict';

    describe('Buoy', function() {
        var buoy = null
          , server = null;

        beforeEach(function(done) {
            server = { on: sinon.stub() };
            buoy = new Buoy(server);

            done();
        });

        describe('constructor', function() {
            it('should set properties with default and passed values', function(done) {
                buoy.should.have.property('svr');
                buoy.should.have.property('peers');
                buoy.should.have.property('rooms');

                buoy.svr.should.eql(server);
                buoy.peers.should.be.empty;
                buoy.rooms.should.be.empty;

                done();
            });

            it('should attach a request listener to the websockets server', function(done) {
                buoy.svr.on.calledOnce.should.be.true;
                buoy.svr.on.getCall(0).args[0].should.eql('request');
                buoy.svr.on.getCall(0).args[1].should.be.a.Function;

                done();
            });
        });

        describe('sendPeer', function() {
            var sendStub = null;

            beforeEach(function(done) {
                sendStub = sinon.stub();
                buoy.peers = { 'foo': { send: sendStub } };

                done();
            });

            it('should send the event and its data to the selected peer', function(done) {
                buoy.sendPeer('foo', 'bar', { 'baz': 'bat' });

                sendStub.calledOnce.should.be.true;
                sendStub.calledWith('bar', { 'baz': 'bat' }).should.be.true;

                done();
            });

            it('should do nothing if the peer is not found', function(done) {
                delete buoy.peers['foo'];
                buoy.sendPeer('foo', 'bar', { 'baz': 'bat' });

                sendStub.called.should.be.false;

                done();
            });

            it('should not send any data to any additional peers', function(done) {
                buoy.peers['foo2'] = { send: sinon.stub() };
                buoy.peers['foo3'] = { send: sinon.stub() };

                buoy.sendPeer('foo', 'bar', { 'baz': 'bat' });
                buoy.sendPeer('foo2', 'bar', { 'baz': 'bat' });

                buoy.peers['foo'].send.calledOnce.should.be.true;
                buoy.peers['foo2'].send.calledOnce.should.be.true;
                buoy.peers['foo3'].send.called.should.be.false;

                done();
            });
        });

        describe('getRoom', function() {
            var emitSpy = null;

            beforeEach(function(done) {
                emitSpy = sinon.spy(buoy, 'emit');

                done();
            });

            it('should find the correct room if one alredy existed', function(done) {
                buoy.rooms = { 'blearghth': { name: 'blearghth' } };

                buoy.getRoom('blearghth').should.eql({ name: 'blearghth' });
                emitSpy.called.should.be.false;

                done();
            });

            it('should create a new room if one did not already exist', function(done) {
                var result = buoy.getRoom('hnnngh');
                result.name.should.eql('hnnngh');

                emitSpy.calledOnce.should.be.true;
                emitSpy.calledWith('newRoom', { room: result }).should.be.true;

                done();
            });

            it('should save the room if a new one was created', function(done) {
                var result = buoy.getRoom('hnnngh');
                buoy.rooms['hnnngh'].should.eql(result);

                done();
            });
        });

        describe('deleteRoom', function() {
            var emitSpy = null;

            beforeEach(function(done) {
                emitSpy = sinon.spy(buoy, 'emit');

                done();
            });

            it('should remove the room from the directory of known rooms', function(done) {
                buoy.rooms = { 'blearghth': { name: 'blearghth' } };
                buoy.deleteRoom('blearghth');

                buoy.should.not.have.keys('blearghth');

                done();
            });

            it('should notify clients that the room was deleted', function(done) {
                buoy.room = { 'blearghth': { name: 'blearghth' } };
                buoy.deleteRoom('blearghth');

                emitSpy.calledOnce.should.be.true;
                emitSpy.calledWith('deleteRoom', { room: 'blearghth' }).should.be.true;

                done();
            });
        });
    });
})();