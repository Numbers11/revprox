//REVERSE PROXY PART
var net = require('net');
var http = require('http');
var socks = require('./socks.js');
var util = require("util");

///////////vars
var cmdport    = 7070;
var tunnelport = 8080;
var Tunnels = {};
var Clients = {};


//returns an ID between 1000 + 9999
function calcId() {
		return Math.floor(1000 + Math.random() * 8999);
}


//returns random string of len
function randStr(len)
{
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < len; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

//The CMD server
var svrCMD = net.createServer(function(socket) {
	socket.on('data', function(data) {
	 	if (data.toString().substring(0,4) == 'ONLN') {
			//new client here
			var socksusername = 'revprox';			//TODO: CHANGE BACK TO RANDOM PASSWORD
			//var sockspassword = randStr(5);
			var sockspassword = 'revprox';  //TESTING!!
			//a new client needs a new proxy on a new port
			var socksProxy = new socks.createServer(socksusername, sockspassword, function(sock, port, address, proxy_ready) {
				//on new proxy request
				var id = calcId();
				sock.ready = proxy_ready;
				console.log('[' + id + '] new proxy request to ' + address + ':' + port);
				//requesting new tunnel
				socket.write('SOCK' + id + address + ':' + port + '~');
				sock.opensince = new Date().getTime();
				sock.targethost = address;
				sock.targetport = port;
				Tunnels[id] = sock;
			});
			socksProxy.listen(0);//8888 //TESTING!!
			socksProxy.on('listening', function() {
				//Proxy Server is up and running
				//add Client data
				var username = data.toString().substring(4, data.toString().indexOf('|'));
				var pcname  = data.toString().substr( data.toString().indexOf('|') + 1);
				var clientid = calcId();
				socket.username = username;
				socket.pcname = pcname;
				socket.id = clientid;
				socket.socksusername = socksusername;
				socket.sockspassword = sockspassword;
				socket.onlinetime = new Date().getTime();
				socket.proxyaddr = socksProxy.address();
				socket.proxysvr = socksProxy;
				Clients[clientid] = socket;
				console.log('-------------');
				console.log(Clients[clientid]);
				console.log('New client[' + clientid + ']: ' + socket.remoteAddress + ':' + socket.remotePort + ' - ' + username + '@' + pcname + ' at Port: ' + socksProxy.address().port);
				console.log('-------------');
			});
			
			socksProxy.on('error', function(e) {
					//Error on proxy server
					console.log('Proxy server error: ' + e);
			});
			
		}
		//else disconnect?
	});
	socket.on('close', function(had_error) {
		console.log(Clients[socket.id]);
		console.log('client disconnected');
		Clients[socket.id] = null;
		delete Clients[socket.id];
		socket.proxysvr.close();
	});
	socket.on('error', function(e) {
		console.log('[' + socket.id + '] CMD error: ' + e);
	});
});
svrCMD.listen(cmdport);


//A tunnelrequest got answered from a client
function tunnelrequest(data) {

	if (data.toString().substring(0,4) == 'SOCK') {
		var id = data.toString().substring(4, 8);
		var proxy = Tunnels[id];
		var socket = this;
		socket.proxy = proxy;	
		this.removeListener('data', this.tunnelreq);
		if (proxy == undefined) {
			console.log('ERROR: Found no matching Tunnel for ID ' + id);
			socket.end();
		}
		console.log('[' + id + '] New tunnel request');
		socket.setTimeout(60000, function(error){
			if (this.proxy !== undefined) {
			proxy.removeAllListeners('data');
            proxy.removeAllListeners('timeout');
                proxy.end();

			}
			this.end();
			console.error('socket timeout 60000ms');
		}.bind(this));

		proxy.setTimeout(60000, function(error){
			proxy.removeAllListeners('data');
			proxy.end();
			this.end();
			console.error('proxy socket timeout 60000ms');
		}.bind(this));
		//now tunnel, bitch!
		proxy.ready();
		proxy.on('data', function(d) {
			try {
				console.log('[' + id + '] receiving ' + d.length + ' bytes from proxy');
				socket.write(d);
			} catch(err) {
					console.log('[' + id + '] write error ' + err);
			}
		});
		
		socket.on('data', function(d) {
			// If the application tries to send data before the proxy is ready, then that is it's own problem.
			try {
				console.log('[' + id + '] sending ' + d.length + ' bytes to proxy');
				proxy.write(d);
			} catch(err) {
					console.log('[' + id + '] write error ' + err);
			}
		});
		socket.on('error', function(e) {
			console.log('[' + id + '] socket error: ' + e);
		});
		
		proxy.on('error', function(e) {
			console.log('[' + id + '] proxy error: ' + e);
		});
		
		proxy.on('close', function(had_error) {
			socket.end();
			console.error('[' + id + '] The proxy closed');
		}.bind(this));
		
		socket.on('close', function(had_error) {
			if (this.proxy !== undefined) {
				console.log('[' + id + '] check if executed'); //NOT SURE!!
				proxy.removeAllListeners('data');
                proxy.removeAllListeners('timeout');
				proxy.end();
			}
			console.error('[' + id + '] The application closed');
			//remove Tunnel from list
			Tunnels[id] = null;
			delete Tunnels[id];
		}.bind(this));
		
	} else {
		console.log('Something is wrong, no SOCK received');
		console.log(data);
		this.end();
	}
}

//The Tunnel Server
var svrTunnel = net.createServer(function(socket) {
	socket.tunnelreq = tunnelrequest.bind(socket);
	//??\\
	socket.on('data', socket.tunnelreq);

    socket.on('error', function(e) {
        console.log('Error on tunnelserver: ' + e);
    });
});
svrTunnel.listen(tunnelport);



exports.clientlist = Clients;
exports.tunnellist = Tunnels;
