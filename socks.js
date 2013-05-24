/*
Slightly modified version of node-socks (https://github.com/gvangool/node-socks)
to support basic auth.
*/

var net = require('net'),
    util = require('util'),
/*     log = function(args) {
        //console.log(args);
    }, */
		log = console.info,
    info = console.info,
    errorLog = console.error,
    clients = [],
    SOCKS_VERSION = 5,
/*
* Authentication methods
************************
* o X'00' NO AUTHENTICATION REQUIRED
* o X'01' GSSAPI
* o X'02' USERNAME/PASSWORD
* o X'03' to X'7F' IANA ASSIGNED
* o X'80' to X'FE' RESERVED FOR PRIVATE METHODS
* o X'FF' NO ACCEPTABLE METHODS
*/
    AUTHENTICATION = {
        NOAUTH: 0x00,
        GSSAPI: 0x01,
        USERPASS: 0x02,
        NONE: 0xFF
    },
/*
* o CMD
* o CONNECT X'01'
* o BIND X'02'
* o UDP ASSOCIATE X'03'
*/
    REQUEST_CMD = {
        CONNECT: 0x01,
        BIND: 0x02,
        UDP_ASSOCIATE: 0x03
    },
/*
* o ATYP address type of following address
* o IP V4 address: X'01'
* o DOMAINNAME: X'03'
* o IP V6 address: X'04'
*/
    ATYP = {
        IP_V4: 0x01,
        DNS: 0x03,
        IP_V6: 0x04
    },
    Address = {
        read: function (buffer, offset) {
                  if (buffer[offset] == ATYP.IP_V4) {
                      return util.format('%s.%s.%s.%s', buffer[offset+1], buffer[offset+2], buffer[offset+3], buffer[offset+4]);
                  } else if (buffer[offset] == ATYP.DNS) {
                      return buffer.toString('utf8', offset+2, offset+2+buffer[offset+1]);
                  } else if (buffer[offset] == ATYP.IP_V6) {
                      return buffer.slice(buffer[offset+1], buffer[offset+1+16]);
                  }
              },
        sizeOf: function(buffer, offset) {
                    if (buffer[offset] == ATYP.IP_V4) {
                        return 4;
                    } else if (buffer[offset] == ATYP.DNS) {
                        return buffer[offset+1];
                    } else if (buffer[offset] == ATYP.IP_V6) {
                        return 16;
                    }
                }
    };

function createSocksServer(username, password, cb) {
    var socksServer = net.createServer();
    socksServer.on('listening', function() {
        var address = socksServer.address();
        info('LISTENING %s:%s', address.address, address.port);
    });
    socksServer.on('connection', function(socket) {
        info('CONNECTED %s:%s', socket.remoteAddress, socket.remotePort);
				socket.username = username;
				socket.password = password;
        initSocksConnection.bind(socket)(cb);
    });
    return socksServer;
}
//
// socket is available as this
function initSocksConnection(on_accept) {
    // keep log of connected clients
    clients.push(this);

    // remove from clients on disconnect
    this.on('end', function() {
        var idx = clients.indexOf(this);
        if (idx != -1) {
            clients.splice(idx, 1);
        }
    });
    this.on('error', function(e) {
        errorLog('%j', e);
    });

    // do a handshake
    this.handshake = handshake.bind(this);
    this.on_accept = on_accept; // No bind. We want 'this' to be the server, like it would be for net.createServer
    this.on('data', this.handshake);
}

function handshake(chunk) {
    this.removeListener('data', this.handshake);

    var method_count = 0;
		
    // SOCKS Version 5 is the only support version
    if (chunk[0] != SOCKS_VERSION) {
        errorLog('handshake: wrong socks version: %d', chunk[0]);
        this.end();
    }
    // Number of authentication methods
    method_count = chunk[1];

/*
    this.auth_methods = [];
    // i starts on 1, since we've read chunk 0 & 1 already
    for (var i=2; i < method_count + 2; i++) {
        this.auth_methods.push(chunk[i]);
    }
    log('Supported auth methods: %j', this.auth_methods);
*/

    var resp = new Buffer(2);
    resp[0] = 0x05;
    if (this.username == '' && this.password == '') {          //this.auth_methods.indexOf(AUTHENTICATION.NOAUTH) > -1 &&
        log('Handing off to handleRequest');
        this.handleRequest = handleRequest.bind(this);
        this.on('data', this.handleRequest);
        resp[1] = AUTHENTICATION.NOAUTH;
        this.write(resp);
    } else {           // if (this.auth_methods.indexOf(AUTHENTICATION.USERPASS) > -1)
				
				log('Heyho, password auth. Right Auth: ' + this.username + ':' + this.password);		/////WORK IN PROGRESS
        this.handleUserPass = handleUserPass.bind(this);
        this.on('data', this.handleUserPass);
        resp[1] = AUTHENTICATION.USERPASS;
        this.write(resp);
				
/*		} else {
        errorLog('Unsuported authentication method -- disconnecting');
        resp[1] = 0xFF;
        this.end(resp);*/
    }
}

//WORK IN PROGRESS
function handleUserPass(chunk) {
	this.removeListener('data', this.handleUserPass);
	var resp = new Buffer(2);
	resp[0] = SOCKS_VERSION;
	resp[1] = 0x01;
	
	if (chunk.length < 5) {
			errorLog("userPassDataHandler: chunk length was < 5. Dropping");
			this.end(resp);
			return;
	}

	// Wrong version!SOCKS_VERSION
	if (chunk[0] !== 1) {
			errorLog('userPassDataHandler: wrong socks version: %d', chunk[0]);
			this.end(resp);
			return;
	} 
	
	var userLen = chunk[1];

	var offset = 2;
	var user = chunk.toString("utf8", offset, userLen + offset);
	offset += userLen;
	
	var pwLen = chunk[offset];
	var password = chunk.toString("utf8", offset + 1, pwLen + offset + 1);

	log("user='%s' password='%s'", user, password);
	if (user == this.username && password == this.password) {
		log("user '%s' authenticated successfully", user);
		this.handleRequest = handleRequest.bind(this);
		this.on('data', this.handleRequest);
		
		resp[1] = 0x00;
		this.write(resp);
	} else {
		log("user '%s' failed with wrong password", user);
    this.end(resp);
	}
}


function handleRequest(chunk) {
		log(chunk);
    this.removeListener('data', this.handleRequest);
    var cmd=chunk[1],
        address,
        port,
        offset=3;
    // Wrong version!
    if (chunk[0] !== SOCKS_VERSION) {
        this.end(util.format('%d%d', 0x05, 0x01)); //
        errorLog('handleRequest: wrong socks version: %d', chunk[0]);
        return;
    } /*else if (chunk[2] == 0x00) {
this.end(util.format('%d%d', 0x05, 0x01));
errorLog('handleRequest: Mangled request. Reserved field is not null: %d', chunk[offset]);
return;
		} */
		//ADDRESS TYPE
			if (chunk[3] == 3) {	//DOMAIN NAME
				address = Address.read(chunk, 3);
				offset = 3 + Address.sizeOf(chunk, 3) + 2;
				port = chunk.readUInt16BE(offset);
				
 			} else if (chunk[3] == 1) {	//IP
				address = Address.read(chunk, 3);
				offset = 8;
				port = chunk.readUInt16BE(offset);				
				console.log(address + ':' + port);
			} else {
				log('Address type not supported!');
        this.end(util.format('%d%d', 0x05, 0x01));
        return;
			}
			

    log('Request: type: %d -- to: %s:%s', chunk[1], address, port);

    if (cmd == REQUEST_CMD.CONNECT) {
        this.request = chunk;
        this.on_accept(this, port, address, proxyReady.bind(this));
    } else {
        this.end(util.format('%d%d', 0x05, 0x01));
        return;
    }
}

function proxyReady() {
	//console.log(util.inspect(this, true, 7));
    log('Indicating to the client that the proxy is ready');
    // creating response
    var resp = new Buffer(this.request.length);
    this.request.copy(resp);
    // rewrite response header
    resp[0] = SOCKS_VERSION;
    resp[1] = 0x00;
    resp[2] = 0x00;
    this.write(resp);
    log('Connected to: %s:%d', resp.toString('utf8', 4, resp.length - 2), resp.readUInt16BE(resp.length - 2));

}

module.exports = {
    createServer: createSocksServer
};