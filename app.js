var bodyParser = require('body-parser');
var signale = require('signale');
var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    express = require('express');
var session = require('express-session');
var OrientDB = require('orientjs');
var bcrypt = require('bcrypt-nodejs');
var OrientoStore = require('connect-oriento')(session);
var config  = require('./config/config.json');
var bkfd2Password = require("pbkdf2-password");
var nodemailer = require('nodemailer');
var hasher = bkfd2Password();
var app = express();
app.locals.pretty = true;
var port = 80;
var httpsPort = 443;

var privateKey = fs.readFileSync('config/ssl/RWdSme569UCsFkURI5sOUg-key.pem', 'utf8');
var certificate = fs.readFileSync('config/ssl/RWdSme569UCsFkURI5sOUg-crt.pem', 'utf8');

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'myrhydevelopteam@gmail.com',
    pass: config.orient.password
  }
});

var server = OrientDB({
   host:config.orient.host,
   port:config.orient.port,
   username:config.orient.username,
   password:config.orient.password
});

var db = server.use(config.orient.db);

app.use(session({
    secret: config.app_pw.secret,
    resave: config.app_pw.resave,
    saveUninitialized: config.app_pw.saveUninitialized,
    store: new OrientoStore({
      server: config.store.server
    })
}));

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('views'));
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/auth/logout', function(req, res){
  delete req.session.nickName;
  delete req.session.userName;
  delete req.session.passWord;
  delete req.session.loginedSuccessfully;
  req.session.save(function(){
    res.redirect('/');
  });
});

app.get('/prototype', function(req, res){
  res.render('prototype');
});

app.get('/', function(req, res){
  if(req.session.nickName && req.session.UID) {
    res.redirect('/game');
  } else {
    res.render('index');
  }
});

app.get('/ping', function(req, res){
  res.send("pong!");
});

app.post('/auth/login', function(req, res){
  req.session.cookie.maxAge = 3 * 24 * 60 * 60 * 1000;
  var users;
  db.class.get('user').then(function(user){
    var ULength;
    user.list().then(function(User){
      users = User;
      ULength = User.length;
      var email = req.body.email;
      var passWord = req.body.verySecuredText;
      for(var i = 0; i < ULength; i++) {
        var user = users[i];
        if(email === user.email) {
          if(user.usable == true) {
            return hasher({password: passWord, salt: user.salt}, function(err, pass, salt, hash) {
              if(hash === user.passWord) {
                req.session.nickName = user.nickName;
                req.session.UID = user.userId;
                req.session.loginedSuccessfully = true;
                req.session.save(function(){
                  res.redirect('/');
                });
              } else {
                res.render('loginDenined');
              }
            });
          } else {
            res.render('unableAccount');
          }
        }
      }
      res.render('loginDenined');
    });
  });
});

app.get('/copyright', function(req, res){
  res.render('copyright');
});

app.get('/game', function(req, res){
  if(req.session.loginedSuccessfully) {
    db.record.get('#22:' + req.session.UID)
   .then(
      function(userRecord){
        res.render('game', {nickName: req.session.nickName, UID: req.session.UID, record: JSON.stringify(userRecord.records)});
      }
   );
  } else {
    res.redirect('/');
  }
});

app.get('/sameName', function(req, res){
  res.render('sameName');
});

app.get('/sameEmail', function(req, res){
  res.render('sameEmail');
});

function makeCode() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 6; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

app.post('/auth/join', function(req, res){
  allowedFormat = /^[a-zA-Z0-9\~\!\@\#\$\%\^\&\*\(\)\_\-\+\=\,\<\.\>\/\?\;\:\'\"\[\{\]\}\|\\]{5,15}$/;
  var usercode = makeCode();
  req.session.mailCode = usercode;
  if(allowedFormat.test(req.body.personalData) && allowedFormat.test(req.body.verySecuredText)) {
    db.class.get('User').then(function(user){
      user.list().then(function(User){
        var ULength = User.length;
        signale.debug(`ULength = ${ULength}`)
        req.session.emailUID = ULength;
        for(var i = 1; i < ULength; i++) {
          var userr = User[i];
          signale.debug(`userEmail = ${req.body.email}, DBEmail = ${userr.email}, result = ${req.body.email == userr.email}`);
          if(req.body.personalData == userr.nickName) {
            res.redirect('/sameName');
            return;
          } else if(req.body.email == userr.email){
            res.redirect('/sameEmail');
            return;
          }
        }

        var mailOptions = {
          from: 'myrhydevelopteam@gmail.com',
          to: req.body.email,
          subject: 'MyRhy verification code',
          text: 'MyRhy의 이메일 확인 창에 아래의 메시지를 정확히 입력해주세요.\n아래의 메시지는 당신말고 아무도 알지 못합니다!\n' + usercode
        };

        transporter.sendMail(mailOptions, function(error, info){
          if (error) {
            console.log(error);
          }
        });

        hasher({password:req.body.verySecuredText}, function(err, pass, salt, hash){
          db.class.get('UserRecords').then(function(UserRecords){
            UserRecords.create({
              userName: req.body.personalData,
              userId: ULength
            }).then(function(){
              user.create({
                usable: false,
                email: req.body.email,
                passWord: hash,
                nickName: req.body.personalData,
                userId: ULength,
                salt: salt
              })
            }).then(function(){
              res.redirect('/auth/chkmail');
            });
          });
        });
        return;
      });
    });
  } else {
    res.redirect('/auth/unAllowedCharacter');
  }
});

app.get('/auth/chkmail', function(req, res){
  res.render('email');
});

app.post('/auth/chkmail', function(req, res){
  if(req.session.mailCode == req.body.checkCode){
    var recordID = '#21:' + req.session.emailUID;
    db.record.get(recordID)
      .then(function(record){
        record.usable = true;
        db.record.update(record)
           .then(function(){
            res.redirect('login');
            })
        });
  } else {
    res.render('emailDenined');
  }
});

app.get('/auth/unAllowedCharacter', function(req, res){
  res.send("허용되지 않은 문자를 입력했거나 공백을 전송했습니다.");
});

app.get('/auth/login', function(req, res){
  if(req.session.nickName && req.session.userName && req.session.passWord) {
    res.redirect('/game');
  } else {
    res.render('login');
  }
});

app.get('/play/:songName/:difficulty', function(req, res){
  if(req.session.nickName && req.session.UID) {
    res.render('play', {songName: req.params.songName, difficulty: req.params.difficulty});
  } else {
    res.redirect('/');
  }
});

app.get('/auth/join', function(req, res){
  res.render('join');
});

http.createServer(function (req, res) {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(port, function() {
  signale.success(`HTTP Server running at port ${port}.`);
});

https.createServer({
    key: privateKey,
    cert: certificate
}, app).listen(httpsPort, function() {
  signale.success(`HTTPS Server running at port ${httpsPort}.`);
});
