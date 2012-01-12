// for now all routes go in here. We will probbably break them up at some point

var Crypto = require("ezcrypto").Crypto;

/*
 * GET home page.
 */

exports.index = function(req, res){
  if (!req.session.valid){
    res.render("index", {title: "Hopkins Planner", loggedIn: false,
                       flash: req.flash()});
  }else{
    var date = new Date(); // get the current date
    date = new Date(date.getTime() - ((date.getDay() - 1) % 7) * 24 * 60 * 60 * 1000); // convert to monday

    // set it to to the beginning of monday EST
    date.setUTCHours(5); 
    date.setUTCMinutes(0);
    date.setUTCSeconds(0);
    date.setUTCMilliseconds(0);
    console.log(req.session.userId, date.getDate(), date.getTime(), date.getTime() + 604800000);

    // get every event for the current user in this week
    Event.find({owner: req.session.userId, timestamp: {$gte: date.getTime(), $lte: date.getTime() + 604800000}}, function(err, events){
      var eventsObj = {};
      for (var i = 0; i < events.length; i++){
        if (!eventsObj[events[i].day])
          eventsObj[events[i].day] = {};

        if (!eventsObj[events[i].day][events[i].block])
            eventsObj[events[i].day][events[i].block] =[];

        eventsObj[events[i].day][events[i].block].push(events[i]); // insert this event into the correct place in the event object
      }
      //TODO use the date to pick gray or maroon
      res.render("week", {title: "Hopkins Week", date: date.getTime(), loggedIn: true, flash: req.flash(),
                          week: getWeekStructure("gray"), events: eventsObj});
    });

  }
};


/*
 * GET monthly calendar page.
 */

exports.monthly = function(req, res){
  res.render("calendar", {title: "Monthly Planner", loggedIn: req.session.valid});
};

/*
 * GET /weekly
 */

exports.weekly = function(req, res){
  res.render("week", {title: "Weekly Planner", loggedIn: req.session.valid});
}

/*
 * GET /signup
 */

exports.createAccount = function(req, res){
  res.render("createAccount", {title: "Login", loggedIn: req.session.valid, 
                               flash: req.flash()});
}

/*
 * POST /createAccount
 */
exports.createUser = function(req, res){
  var salt     = createSalt();
  var password = Crypto.SHA256(req.body.password + salt); 
  var user  = new User({
    email: req.body.email,
    password: password,
    salt: salt,
    name: req.body.name,
    is_teacher: (req.body.is_teacher == "on") ? true : false
  });

  user.save(function(err){
    if (err){
      if (err.type == undefined){ // this is a bad way to check for this
        req.flash("error", "That email is already being used");
        req.flash("errorEmail", "error");
        res.redirect("back");
        return;
      }
      console.log(err.errors, err);
      if (err.errors.email){
        req.flash("error", "Please try again with a valid email address");
        req.flash("errorEmail", "error");
      }else if (err.errors.password){
        req.flash("error", "Password can not be empty");
        req.flash("errorPass", "error");
      }
      res.redirect("back");
    }else{
      res.redirect(req.body.redirect || "/");
    }
  })
};

/* 
 * POST /login
 */
exports.login = function(req, res){
  email = req.body.email;
  console.log(email);
  User.find({email: email}, function(err, users){
    user = users[0];

    if (users.length == 0){
      req.flash("error", "Invalid email");
      req.flash("emailError", "error");
      res.redirect("back");
      return;
    }

    if (Crypto.SHA256(req.body.password + user.salt) == user.password){
      validateUser(req, user._id);
      req.session.displayName = user.name;
      res.redirect(req.body.redirect || "back");
    }else{
      req.flash("error", "Invalid password");
      req.flash("passError", "error");
      req.flash("email", user.email);
      res.redirect("back");
    }
  });
}

/*
 * GET /logout
 */
 exports.logout = function(req, res){
   logout(req);
   res.redirect(req.body.redirect || "back");
 }
 
/*
 * Classes
 */

/*
 * POST /createClass
 */
exports.createClass = function(req, res) {
  User.find({email: req.body.teacher}, function(err, users) {
    if(users.length == 0) {
      req.flash("error", "Invalid teacher email");
      req.flash("emailError", "error");
      res.redirect("back");
      return;
    }
    
    var teacher = users[0];
    if(!teacher.is_teacher) {
      req.flash("error", "Email is not a teacher's email");
      req.flash("emailError", "error");
      res.redirect("back");
      return;
    }
    
    //todo: add authentication
    
    var _class = new Class({
      name: req.body.name,
      teacher: teacher._id.toString(),
      block: req.body.block,
      events: [],
      students: []
    });
    
    _class.save(function(err) {
      if(err != null)
        console.log(err);
    });
    
    res.redirect("back");
  });
}

exports.addStudent = function(req, res) {
  console.log("got here");
  Class.find({name: req.body.name}, function(err, classes) {
    console.log(classes);
    if(classes.length == 0) {
      req.flash("error", "Could not find class");
      res.redirect("back");
      return;
    }
    
    var _class = classes[0];
    User.find({email: req.body.email}, function(err, users) {
      console.log(users);
      if(users.length == 0) {
        req.flash("error", "could not find user");
        res.redirect("back");
        return;
      }
      
      var student = users[0];
      _class.students.push(student._id.toString());
      _class.save();
      res.redirect("back");
    });
  });
}

 /*
  * Event Requests
  */

 /*
  * POST /event
  */
exports.createEvent = function(req, res){
  if (!req.session.valid){
    res.writeHead(401, {"error": 401, msg: "You must be logged in to add an event"});
    req.flash("error", "You must login first");
    return;
  }
  var newEvent = new Event({
    type: "individual", // for now there is only support for individual student events
    name: req.body.name,
    timestamp: req.body.timestamp,
    day: req.body.day,
    block: req.body.block,
    description: req.body.description,
    owner: req.session.userId
  });
  newEvent.save(function(error){
    res.writeHead(200, {"Content-Type": "application/json"});
    if (!error){
      res.end(JSON.stringify({error: 0, msg: "Event added"}));
    }else{
      res.end(JSON.stringify({error: 101, msg: error}));
    }
  });
}


// User releated functions we may want to move these to another file
function validateUser(req, id){
  /* req.sessions.regenerate(function(){
  }) // I'm not sure that we want or need this */

  req.session.valid = 1;
  console.log(id);
  req.session.userId = id; 
}

function logout(req){
  req.session.destroy();
}

function isLoggedIn(req){
  if (req.session.valid)
    return true;
  return false;
}

function createSalt(){
  var string = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for( var i=0; i < 3; i++ ){
    string += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return Crypto.SHA256(string);
}

function getWeekStructure(weekColor){
  var maroonWeek = [
    ["A", "B", "A", "A", "B", "No school", "No School"],
    ["C", "C", "B", "C", "A", "", ""],
    ["D", "D", "E", "D", "C", "", ""],
    ["E", "F", "F", "E", "F", "", ""],
    ["F", "G", "activity", "G", "G", '', ''],
    ["G", "H", "", "H", "H", "", ""]
  ];
	var grayWeek = [
    ['A', 'B', 'A', 'B', 'B', "No School", "No School"],
    ["C", "C", "B", "C", "A", "", ""],
    ["D", "D", "E", "D", "D", "", ""],
    ["E", "E", "F", "E", "F", "", ""],
    ["F", "G", "activity", "G", "G", "", ""],
    ["H", "H", "", "H", "H", "", ""]
  ];
		
	return (weekColor == "maroon") ? maroonWeek.slice(0) : grayWeek;
}
