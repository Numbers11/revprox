//DISPLAY FRONTEND VIA EXPRESS
var express = require('express');
var http 	= require('http');
var app 	= express();
var path 	= require('path');

var engine = require('ejs-locals');
var async = require('async');
var util = require('util');
var geoip = require('geoip-lite');
var fs = require('fs');
var revprox = require('./revprox.js');
var config = require('./config.js');

//returns Country Code from IP
function GetCountryCode(ip) {
	if (geoip.lookup(ip) === null) return '00';
	return geoip.lookup(ip).country.toLowerCase();	//ip
}


//////////////////////
//init express
app.configure(function(){
  app.engine('ejs', engine);
  app.set('port', process.env.PORT || config.expressport);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ secret: config.secret }));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));

});




//////////////////////////
//Routes

app.get('/', ensureAuthenticated,function(req, res) {
	res.sendfile('views/page.html');
});

//Login page
app.get('/login', function(req, res) {
	res.sendfile('views/login.html');
});

//Login Post Request
app.post('/login', function(req, res) {
	console.log('login!' + req.body.password);
	if (req.body.password == config.password && req.body.username == config.username) {
		req.session.loggedIn = true;
		res.redirect('/');
	} else {
		res.redirect('/login');
	}
});

//Check Login
function ensureAuthenticated(req, res, next) {
  if (req.session.loggedIn) { return next(); }
  res.redirect('/login');
}

//Logout
app.get('/logout', ensureAuthenticated, function(req, res) {
	req.session.destroy();
	res.redirect('/login');
});

//Get Tunnels JSON data
app.get('/gettunnels.json', ensureAuthenticated, function(req, res) {
	var result = [];
//////async
	async.forEach(Object.keys(revprox.tunnellist),
             function(item, callback) {   //TODO: add ID of requesting client instead of tunnelid
			result.push({id: item, ip: revprox.tunnellist[item].targethost, port: revprox.tunnellist[item].targetport, bytesread : revprox.tunnellist[item].bytesRead, byteswritten : revprox.tunnellist[item].bytesWritten, opensince : revprox.tunnellist[item].opensince});
			callback();
		},
		 function(err){
			// if any of the saves produced an error, err would equal that error
			res.json(result);
	});
});	


//Get Clients JSON data
app.get('/getclients.json', ensureAuthenticated, function(req, res) {
	var result = [];
//////async because else it would hang up the whole application with enough objects.
	async.forEach(Object.keys(revprox.clientlist), 
		 function(item, callback) {
			result.push({id: item, ip: revprox.clientlist[item].remoteAddress, country: GetCountryCode(revprox.clientlist[item].remoteAddress), info: revprox.clientlist[item].username + ':' + revprox.clientlist[item].pcname, onlinetime: revprox.clientlist[item].onlinetime, proxyport: revprox.clientlist[item].proxyaddr.port, proxyauth: revprox.clientlist[item].socksusername + ':' + revprox.clientlist[item].sockspassword});
			callback();
		},
		 function(err){
			// if any of the saves produced an error, err would equal that error
			res.json(result);
	});
});
                             
app.post('/setclients.json', ensureAuthenticated, function(req, res) {
    if (!req.body) {
        return res.json({'status' : 'error'})
    }
    console.log(req.body);
    console.log(util.inspect(req.body)) ;
    //var cmd =  req.body.json
    if (req.body.option == 'close' ) {      //TODO: Other commands
        async.forEach(req.body.clients,
            function(item, callback) {
                console.log(item);
                revprox.clientlist[item.id].end('CLSE~');
                console.log(req.body.option + ' clients with IDs: ' + req.body.clients[0].id);
                callback();
            },
            function(err){
                // if any of the actions produced an error, err would equal that error
                res.json({'status' : 'ok'}); //TODO: error handling
            });
    }
});

////////////////
//Start Express
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});