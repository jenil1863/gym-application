const express = require("express");
const app = express();
const HTTP_PORT = process.env.PORT || 8080;

app.use(express.static("styles"));

app.use(express.urlencoded({ extended: true }));

const exphbs = require("express-handlebars");
app.engine(
  ".hbs",
  exphbs.engine({
    extname: ".hbs",
    helpers: {
      json: (context) => {
        return JSON.stringify(context);
      },
    },
  })
);
app.set("view engine", ".hbs");

const session = require("express-session");
app.use(
  session({
    secret: "the quick brown fox jumped over the lazy dog 1234567890",
    resave: false,
    saveUninitialized: true,
  })
);

const bcrypt = require("bcryptjs");

const mongoose = require("mongoose");
mongoose.connect(
  "mongodb+srv://jenilshah1863:5sPWBSliufPTFXlI@cluster0.t1mq6kq.mongodb.net/?retryWrites=true&w=majority"
);
const Schema = mongoose.Schema;
// define schemas
const UsersSchema = new Schema({
  username: String,
  password: String,
});

const ClassesSchema = new Schema({
  image: String,
  class: String,
  time: Number,
});

const PaymentsSchema = new Schema({
  username: String,
  finalAmount: Number,
});

const CartSchema = new Schema({
  username: String,
  classid: mongoose.Types.ObjectId,
});

// TODO: Define models

// - Users Collection
const Users = mongoose.model("user_collection", UsersSchema);

// - Classes Collection
const Classes = mongoose.model("classes_collection", ClassesSchema);

// - Payments Collection
const Payments = mongoose.model("payments_collection", PaymentsSchema);

// - Cart Collection
const Carts = mongoose.model("cart_collection", CartSchema);

// END-POINTS

//Authorization 
app.get("/auth", (req, res) => {
  res.render("partials/login", { layout: "primary" });
});

// to render cart.hbs
app.get("/cartpage", async (req, res) => {
  try {
    if (req.session.hasLoggedInUser === undefined) {
      res.send("ERROR: you must login to view this page");
      return;
    }

    const username = req.session.username;
    const cart = await Carts.find({ username }).lean();
    const classesList = await Classes.find().lean();
    const membershipoffer = req.session.membershipoffer || false;
    const price = 25;

    //displaying list of classes in cart
    let ClassesInCart = [];
    for (let i = 0; i < cart.length; i++) {
      const FindClass = await Classes.findOne({ _id: cart[i].classid }).lean();
      if (FindClass === null) {
        res.send("ERROR: could not find class in cart");
        return;
      }
      FindClass.price = cart[i].price;
      ClassesInCart.push(FindClass);
    }

    //implementing payment figures
    let subtotal = 0;
    if (membershipoffer) {
      subtotal = 0;
    } else {
      subtotal = ClassesInCart.length * price;
    }

    const tax = subtotal * 0.13;
    const total = subtotal + tax;

    res.render("partials/cart", {
      layout: "primary",
      name: ClassesInCart,
      classesList,
      membershipoffer,
      subtotal,
      tax,
      total,
    });
  } catch (err) {
    console.log(err);
    res.send("ERROR: CartPage not loaded");
  }
});

// to create the account
app.post("/create-account", async (req, res) => {

    //fetching username and password from input
  const usernameFromUI = req.body.username;
  const passwordFromUI = req.body.password;

  try {
    const userFromDB = await Users.findOne({ username: usernameFromUI });

    //check if user is already created
    if (userFromDB === null) {
      const RecordUser = new Users({
        username: usernameFromUI,
        password: passwordFromUI,
      });

      await RecordUser.save();

      isCreatingAccount = true;

      //log the user in
      req.session.hasLoggedInUser = true;
      req.session.username = RecordUser.username;
      res.render("partials/monthly", { layout: "primary" });
    } else {
      res.send(`ERROR: There is already a user account for ${usernameFromUI}`);
      return;
    }
  } catch (err) {
    console.log(err);
  }
});

// to render the monthly.hbs page
app.post("/signup", async (req, res) => {
  try {
      //fetch username and monthly membership answer
    const usernameFromUI = req.session.username;
    const MembershipAmount = req.body.membershipoffer;

    //if true record the payment into Payments schema
    if (MembershipAmount === "true") {
      const RecordPayment = new Payments({
        username: usernameFromUI,
        finalAmount: 75,
      });
      await RecordPayment.save();
    }

    res.redirect("/");
  } catch (err) {
    console.log(err);
  }
});

//to login the existing user
app.post("/login", async (req, res) => {

    //fetching username and password from input
  const UsernameFromUI = req.body.username;
  const passwordFromUI = req.body.password;

  try {
      //finding in the database 
    const userFromDB = await Users.findOne({ username: UsernameFromUI });

    //if user is not found
    if (userFromDB === null) {
      res.send(`ERROR: This user does not exist: ${UsernameFromUI}`);
      return;
    }

    //if user found
    if (userFromDB.password === passwordFromUI) {
      req.session.hasLoggedInUser = true;
      req.session.username = userFromDB.username;
      res.redirect("/");
      return;
    } else {
      res.send("ERROR: Invalid password or username.");
      return;
    }
  } catch (err) {
    console.log(err);
  }
});

//to add classes to the cart
app.get("/enroll/:id", async (req, res) => {
    //request id from database and username
  const class_id = req.params.id;
  const usernameFromUI = req.session.username;
  try {

    //check if user is logged in or not
    if (req.session.hasLoggedInUser === undefined) {
      res.send("Please Login to view this page");
      return;
    }

    
    const classesList = await Classes.find().lean();
    //finding particular class using id
    const classFromDB = await Classes.findById(class_id).lean();
    //finding username
    const userFromDB = await Users.findOne({ username: usernameFromUI }).lean();

    //if class or user is not found
    if (!classFromDB || !userFromDB) {
      res.send("Cannot find any class. please try again");
      return;
    }

    //record the new item in carts schema
    const RecordClass = new Carts({
      username: usernameFromUI,
      classid: classFromDB._id,
    });
    await RecordClass.save();

    res.render("partials/schedule", { layout: "primary", name: classesList });
  } catch (err) {
    console.log(err);
    res.send(
      "An error occurred to add classes."
    );
  }
});

//removing the class from cart
app.post("/cartpage/remove/:classid", async (req, res) => {
  try {
      //fetching the id and classid
    const classId = req.params.classid;
    const classFromDB = await Classes.findById(classId).lean();

    //finding the particular class and deleting it.
    const DeleteClass = await Carts.findOneAndDelete({ classid: classFromDB._id });
    if (!DeleteClass) {
      return res.send("No items");
    }
    res.redirect("/cartpage");
  } catch (error) {
    console.log(error);
    res.send("Error: class not removed.");
  }
});

//rendering the schedule page
app.get("/", async (req, res) => {
  try {
    const classesList = await Classes.find().lean();
    if (classesList.length === 0) {
      res.send("NO classes available at the moment. Please check back later!");
      return;
    }
    res.render("partials/schedule", { layout: "primary", name: classesList });
    return;
  } catch (err) {
    console.log(err);
  }
});

//payment endpoint to store the respective payment and deleting classes from cart.
app.post("/payment", async (req, res) => {

    //fetching the username and total amount of respective user
  const usernameFromUI = req.session.username;
  const totalFromUI = req.body.PaymentFromUser;

  //adding payment to Payments schema
  const RecordPayment = new Payments({
    username: usernameFromUI,
    finalAmount: totalFromUI,
  });
  await RecordPayment.save();

  //deleting the classes from the cart
  await Carts.deleteMany({ username: usernameFromUI });
  await RecordPayment.save();

  res.send("Payment confirmed. Congratulations");
});

//start server
const onHttpStart = () => {
  console.log("Express http server listening on: " + HTTP_PORT);
  console.log(`http://localhost:${HTTP_PORT}`);
};
app.listen(HTTP_PORT, onHttpStart);

// data
// [{
//     "image": "https://img.freepik.com/free-photo/yoga-group-classes-inside-gym_1303-14788.jpg?w=2000",
//     "class": "Yoga",
//     "time": 50
// },
// {
//     "image": "https://hips.hearstapps.com/hmg-prod/images/sporty-young-women-with-exercising-rings-in-fitness-royalty-free-image-1579903812.jpg",
//     "class": "Pilates",
//     "time": 45
// },
// {
//     "image": "https://www.zumub.com/blog/wp-content/uploads/2018/02/113_circuit-training.jpeg",
//     "class": "Circuit Training",
//     "time": 30
// },
// {
//     "image": "https://photos.cdn-outlet.com/photos/cms/images/d4a69f10-8868-4ce9-b9a7-4a58e056046d.jpg",
//     "class": "Water Aerobics",
//     "time": 45
// },
// {
//     "image": "https://www.verywellfit.com/thmb/WtaRzGOCbJdVYFlWr_7VOfwn_Ow=/3000x2002/filters:no_upscale():max_bytes(150000):strip_icc()/zumba-fatcamera-c9d4ee824a0f4fda883484f878abc8ae.jpg",
//     "class": "Zumba",
//     "time": 25
// },
// {
//     "image": "https://www.mensjournal.com/.image/ar_4:3%2Cc_fill%2Ccs_srgb%2Cfl_progressive%2Cq_auto:good%2Cw_1200/MTk2MTM2Mzc0NDc0MzE4OTkz/hiit-1.jpg",
//     "class": "HIIT",
//     "time": 35
// }]

