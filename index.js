const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient,ObjectId, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 5000 ;
const app = express();

// Middlewares
app.use(cors({
  origin: ['https://spark-fit.web.app' , 'http://localhost:5173'],  // or your frontend domain
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.opap6sf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const Stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);

// MongoDB Client Setup
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
// client.connect()

//   .then(() => {
//     console.log(' MongoDB connected'); // ✅ REQUIRED — connects MongoDB before using collections

    //jwt middlewares
const verifyJWT = (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1];
   
  try{
  if (!token)    
    return res.status(401).send({ message: 'Unauthorized Access!' })
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: 'Unauthorized Access!' })

    }
    req.tokenEmail = decoded.email
    next()
  })
}
catch (error) {
    console.error('JWT middleware error:', error);
    res.status(500).json({ message: 'Server error in authentication' });
  }
};

// async function run() {
    
    // Database and Collections
    const db = client.db('spark-fitDB');
    const usersCollection = db.collection('users');
    const slotsCollection = db.collection('slots');
    const classCollection = db.collection('classes');
    const paymentCollection = db.collection('payments');
    const subscriberCollection = db.collection('subscribers');
    const forumCollection = db.collection('forum');
    const reviewCollection = db.collection('reviews');

 
    // try {

         // Generate jwt token

      app.post('/jwt', async (req, res) => {
      const userData = req.body;
      const token = jwt.sign(userData, process.env.JWT_ACCESS_SECRET, { expiresIn: '365d' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: false
      })

      res.send({ success: true, token }) 

    })

  //POSt resister user

  app.post('/users', verifyJWT, async (req, res) => {
  const user = req.body;
  console.log("Incoming User:", user);

   

  // Check if user already exists
  const existingUser = await usersCollection.findOne({ email: user.email });
  if (existingUser) {
    return res.send({ message: "User already exists" });
  }

  user.role = 'member';

  // Insert new user into MongoDB
  const result = await usersCollection.insertOne(user);
  res.send(result);
});
    
  app.get('/users/:email/role', async (req, res) => {
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  if (user) {
    res.send({ role: user.role });
  } else {
    res.send({ role: null });
  }
});



// PATCH- applied trainers info in users collection

  app.patch('/apply-trainer', verifyJWT, async (req, res) => {
   console.log('Received email:', ); 
  const { email, ...formData } = req.body;
  
  console.log('Received email:', email);
  console.log('Trainer data:', formData);
  console.log('Incoming body:', req.body);


  const updateDoc = {
    $set: {
      role: 'trainer',
      status: 'pending',
      ...formData,
    },
  };

  const result = await usersCollection.updateOne({ email }, updateDoc, { upsert: true });
   
  console.log(' result:', result);

  res.send(result);
});

//Get trainer

 // Get all trainers
  app.get('/users/:role', async (req, res) => {
  const role = req.params.role;
  const users = await usersCollection.find({ role }).toArray();
  res.send(users);
});


 // Get all trainers
  app.get('/trainers', async (req, res) => {
  const trainers = req.params.trainers;
  const users = await usersCollection.find({role: "trainer", status: "approved"}).toArray();
  res.send(users);
});

 // Get trainer by their id and approved status

app.get('/trainers/:id', async (req, res) => {
  const { id } = req.params;

  // Find the trainer with status 'approved' and matching _id
  const trainer = await usersCollection.findOne({
    _id: new ObjectId(id),
    status: 'approved',            
  });

  if (!trainer) {
    return res.status(404).send({ message: 'Trainer not found or not approved' });
  }

  // Fetch slots for this trainer
  const slots = await slotsCollection.find({ trainerId: id }).toArray();

  res.send({ ...trainer, availableSlots: slots });
});

// Get trainers for 
app.get('/team-trainers', async (req, res) => {
  const trainers = await usersCollection.find({ role: 'trainer', status: 'approved' }).toArray();
  res.send(trainers);
});

    // GET user info
   app.get('/all-users/:email', async (req, res) => {
  const user = await usersCollection.findOne({ email: req.params.email });
  res.send(user);
});


 // Get trainers by Id for trainer details

    app.get('/users/role/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.findOne(query);
      res.send(result);
    })

    // Get trainers by Id for trainer details

    app.get('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.findOne(query);
      res.send(result);
    })


// PATCH update profile
  app.patch('/update/:email', verifyJWT, async (req, res) => {
  const { name, photo } = req.body;
  const result = await usersCollection.updateOne(
    { email: req.params.email },
    { $set: { name, photo } }
    
  );
  res.send(result);
});

// Get activity log

app.get('/activity-log/:email', async (req, res) => {
  const email = req.params.email;
  const query = { email: email };
  const result = await usersCollection.findOne(query) ;
  res.send({ applications: result });
});

// POST Request for reviews

app.post('/reviews', async (req, res) => {
  try {
    const { trainerName, rating, feedback, userEmail, userName } = req.body;

    if (!trainerName || !rating || !userEmail || !userName) {
      return res.status(400).send({ error: 'Missing required fields' });
    }

    // ✅ Step 1: Verify that this user paid for this trainer
    const payment = await paymentCollection.findOne({
      userEmail,
      trainerName,
      status: 'paid'
    });
 

    // ✅ Step 2: Find the trainer by name
    const trainer = await usersCollection.findOne({
      name: trainerName,
      role: 'trainer',
      status: 'approved'
    });

    if (!trainer) {
      return res.status(404).send({ error: 'Trainer not found by name' });
    }

    // ✅ Step 3: Prepare and store the review
    const newReview = {
      userEmail,
      userName,
      rating,
      feedback,
      date: new Date()
    };

    const updateResult = await reviewCollection.updateOne(
      { trainerName: trainer.name }, // use name as identifier for now
      {
        $set: {
          trainerName: trainer.name,
          trainerPhoto: trainer.photo
        },
        $push: { reviews: newReview }
      },
      { upsert: true }
    );

    if (updateResult.modifiedCount > 0 || updateResult.upsertedCount > 0) {
      return res.status(200).send({ message: 'Review added successfully' });
    } else {
      return res.status(500).send({ error: 'Failed to add review' });
    }

  } catch (error) {
    console.error('Error adding review:', error);
    return res.status(500).send({ error: 'Internal server error' });
  }
});

// Get member's review
// Returns: [{ trainerEmail, trainerName, trainerPhoto, reviews: [...] }, ...]
app.get('/reviews', async (req, res) => {
  try {
    const reviews = await reviewCollection.find().toArray();
    res.send(reviews);
  } catch (err) {
    res.status(500).send({ error: "Failed to load reviews" });
  }
});



//  Aggregate to get trainer, slot and classes for Trainer booked page

app.get('/booking-trainer/:id',verifyJWT, async (req, res) => {
  const { id } = req.params;
  console.log({id});
  

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  try {
    const pipeline = [
      { $match: { _id: new ObjectId(id) } },
      {
        $lookup: {
          from: 'users',
          localField: 'trainerEmail',
          foreignField: 'email',
          as: 'trainer',
        },
      },
      {
        $lookup: {
          from: 'classes',
          localField: 'classType',
          foreignField: 'name',
          as: 'classes',
        },
      },
      {
        $unwind: {
          path: '$trainer',
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    const result = await slotsCollection.aggregate(pipeline).toArray();

    if (!result[0]) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    res.send(result[0]);

  } catch (error) {
    console.error('Aggregation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all pending trainers
app.get("/applied-trainers", verifyJWT, async (req, res) => {
  const pending = await usersCollection.find({ role: "trainer", status: "pending" }).toArray();
  res.send(pending);
});


// Get a pending trainers
app.get("/applied-trainers/:id",  verifyJWT, async (req, res) => {
  const id = req.params.id;
  try {
    const trainer = await usersCollection.findOne({ _id: new ObjectId(id), role: "trainer", status: "pending" });

    if (!trainer) {
      return res.status(404).json({ message: "Trainer not found" });
    }

    res.send(trainer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

  // Get top 3 approved trainers
   app.get('/team-trainers', async (req, res) => {
   try {
    const trainers = await usersCollection.find({ role: 'trainer', status: 'approved' })
      .limit(3)
      .project({ name: 1, bio: 1, skills: 1, photo: 1 }) // only necessary fields
      .toArray();

    res.send(trainers);
  } catch (error) {
    console.error('Error fetching trainers:', error);
    res.status(500).send({ error: 'Failed to fetch trainers' });
  }
});


// Approve trainer
app.patch("/approve-trainer/:id", verifyJWT, async (req, res) => {
  const id = req.params.id;
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved" } }
  );
  res.send(result);
});

// Reject trainer
app.post("/reject-trainer/:id", async (req, res) => {
  try {
    const { feedback } = req.body;
    const id = req.params.id;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          role: "member",
          status: "rejected",
          feedback,
          rejectedAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send({ message: "User not found or not updated." });
    }

    res.send({ message: "Trainer application rejected and user updated." });

  } catch (error) {
    console.error("Reject Trainer Error:", error);
    res.status(500).send({ message: "Server error during rejection." });
  }
});

// rejected trainer 

app.get("/rejected-trainer/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Find the rejected trainer by ID
    const trainer = await usersCollection.findOne(
      { _id: new ObjectId(id), status: "rejected" },
      { projection: { feedback: 1, rejectedAt: 1, name: 1, email: 1 } } // select only useful fields
    );

    if (!trainer) {
      return res.status(404).send({ message: "Rejected trainer not found." });
    }

    res.send({
      message: "Rejected trainer feedback retrieved successfully.",
      trainer,
    });
  } catch (error) {
    console.error("Get Rejected Trainer Error:", error);
    res.status(500).send({ message: "Server error retrieving rejected trainer feedback." });
  }
});


// PATCH: Remove trainer role (set role to member)
app.patch('/trainers/remove/:id', async (req, res) => {
  const trainerId = req.params.id;

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(trainerId) },
    { $set: { role: 'member' } }
  );

  res.send(result);
});


// POST - Add new class by admin

   app.post('/classes', async (req, res) => {
      const classes = req.body;
      const result = await classCollection.insertOne(classes);
      res.send(result);
    })

// GET /classes?search=cardio&page=1&limit=6

app.get('/classes', async (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 6;

  const query = {
    name: { $regex: search, $options: 'i' }, // case-insensitive
  };

  const total = await classCollection.countDocuments(query);
  const classes = await classCollection
    .find(query)
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  res.send({
    total,
    classes,
  });
});


// GET  Featured Classes

app.get('/featured-classes', async (req, res) => {
  try {
    const featured = await classCollection.find()
      .sort({ bookingCount: -1 }) // Most booked first
      .limit(6)
      .toArray();

    res.send(featured);
  } catch (error) {
    console.error('Featured classes error:', error);
    res.status(500).send({ error: 'Failed to load featured classes' });
  }
});


// POST /forums
app.post('/forums', async (req, res) => {
  const { email, title, content, category  } = req.body;

  // 1. Look up user role from users collection
  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: 'User not found' });
  }

  const forumPost = {
    email,
    title,
    content,
    category,
    role: user.role || 'member',
    upvotes: [],
    downvotes: [],
    createdAt: new Date()
  };

  // 2. Save forum post with role
  const result = await forumCollection.insertOne(forumPost);

  res.send(result);
});

// GET /forums
app.get("/forums", async (req, res) => {
  const forums = await forumCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(forums);
});

// Get latest forum posts (e.g., latest 6)
app.get('/forum/latest', async (req, res) => {
  try {
    const latestPosts = await forumCollection
      .find()
      .sort({ createdAt: -1 }) // newest first
      .limit(4) // only 6 posts
      .toArray();

    res.send(latestPosts);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch latest forum posts' });
  }
});

// GET  single forum

app.get("/forums/:id", async (req, res) => {
  const id = req.params.id;

  // Validate ObjectId
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid forum ID" });
  }

  try {
    const forum = await forumCollection.findOne({ _id: new ObjectId(id) });
    if (!forum) {
      return res.status(404).send({ error: "Forum post not found" });
    }

    res.send(forum);
  } catch (error) {
    res.status(500).send({ error: "Server error" });
  }
});


// PATCH: Upvote or Downvote

app.patch('/forums/:id/:type', async (req, res) => {
  const { id, type } = req.params;
  const { email } = req.body;

  const field = type === 'upvote' ? 'upvotes' : 'downvotes';
  const opposite = type === 'upvote' ? 'downvotes' : 'upvotes';

  try {
    const forum = await forumCollection.findOne({ _id: new ObjectId(id) });

    if (!forum) return res.status(404).send({ error: 'Forum not found' });

    // Prevent duplicate voting
    if (forum[field]?.includes(email)) {
      return res.send({ modifiedCount: 0, message: 'Already voted' });
    }

    // Update document: add vote, remove opposite
    const result = await forumCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $addToSet: { [field]: email },
        $pull: { [opposite]: email },
      }
    );

    res.send(result); // ✅ Send response back to client
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).send({ error: 'Server error' });
  }
});

// GET latest forum posts
app.get('/forum/latest', async (req, res) => {
  try {
    const latestPosts = await forumCollection
      .find()
      .sort({ createdAt: -1 })  // Ensure you store createdAt in your posts
      .limit(6)
      .toArray();

    res.send(latestPosts);
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch forum posts.' });
  }
});


// POST - Add a new slot

app.post('/slots', async (req, res) => {
      const  slotData = req.body;
      console.log(slotData);
      const result = await slotsCollection.insertOne(slotData);
      res.send(result);

    })   
// GET - Get all slots
app.get('/slots', async (req, res) => {
  const result = await slotsCollection.find().toArray();
  res.send(result);
});

    
// GET - Get single slot

  app.get('/slots/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await slotsCollection.findOne(query);
      res.send(result);
    })

    // Toggle availability status
   app.patch('/slots/:id/toggle', async (req, res) => {
  const id = req.params.id;
  const slot = await slotsCollection.findOne({ _id: new ObjectId(id) });

  if (!slot) {
    return res.status(404).send({ message: 'Slot not found' });
  }
      
  const updated = await slotsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { available: !slot.available } }
  );

  res.send(updated);
});



//update slot
 app.put('/slots/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateSlot = {...req.body};
      console.log(updateSlot);
     
      
      const option = { upsert: true }
      const updateDoc = {
        $set: updateSlot
      }
      const result = await slotsCollection.updateOne(filter, updateDoc, option);
      res.send(result);
    })
  
    //Deleting slot

   app.delete('/slot/:id', async (req, res) => {
  const id = req.params.id;
  const result = await slotsCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount > 0) {
    res.send({ success: true });
  } else {
    res.status(404).send({ error: 'Slot not found' });
  }
});


    // POST - Newsletter Subscriber (check both users and subscribers)
app.post('/subscribers', verifyJWT, async (req, res) => {
  const { email } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    // Check if already subscribed
    const alreadySubscribed = await subscriberCollection.findOne({ email });
    if (alreadySubscribed) {
      return res.status(409).json({ message: "You are already subscribed!" });
    }

    // Optional: Check if email exists in users collection
    const isUser = await usersCollection.findOne({ email });

    // Save to subscribers collection
    const result = await subscriberCollection.insertOne({ email });
    return res.status(201).json({
      message: isUser
        ? "User subscribed to newsletter!"
        : "Guest subscribed to newsletter!",
      id: result.insertedId,
    });
  } catch (err) {
    console.error("Subscription error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get all subscribers
app.get("/subscribers", verifyJWT, async (req, res) => {
  const result = await subscriberCollection.find().toArray();
  res.send(result);
});



  // POST - Payment-intent by stripe
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
   const amountInCents  = req.body.amountInCents;

  try {
    const paymentIntent = await Stripe.paymentIntents.create({
      amount: amountInCents, // amount in cents
      currency: 'usd',
      payment_method_types: ['card'],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

    // POST - Payment system post method

    app.post('/payments', verifyJWT, async (req, res) => {
    const payment = req.body;
    try {
    const result = await paymentCollection.insertOne(payment);
    res.send(result);
    } catch (error) {
    res.status(500).send({ error: 'Failed to save payment info' });
  }
  });

  app.patch('/class-booking-count/:id', async (req, res) => {
  const classId = req.params.id;

  if (!ObjectId.isValid(classId)) {
    return res.status(400).send({ error: 'Invalid class ID' });
  }

  const filter = { _id: new ObjectId(classId) };
  const updateDoc = { $inc: { bookingCount: 1 } };

  try {
    const result = await classCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).send({ error: 'Class not found' });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get all payments
 
app.get('/payments', verifyJWT, async (req, res) => {
  try {
    const payments = await paymentCollection.find().toArray();
    res.send(payments);
  } catch (err) {
    res.status(500).send({ error: 'Failed to fetch payments' });
  }
});

// Get subscriber vs paid member counts
app.get('/member-stats', verifyJWT, async (req, res) => {
  try {
    const totalSubscribers = await subscriberCollection.countDocuments();

    // Use aggregation to count unique emails
    const uniquePaidUsers = await paymentCollection.aggregate([
      { $group: { _id: "$userEmail" } },
      { $count: "total" }
    ]).toArray();

    const totalPaidMembers = uniquePaidUsers[0]?.total || 0;

    res.send({
      totalSubscribers,
      totalPaidMembers,
    });
  } catch (error) {
    console.error('Error in /member-stats:', error.message);
    res.status(500).send({ message: 'Internal Server Error', error: error.message });
  }
});

// 📊 GET - Dashboard Stats
app.get('/dashboard-stats', verifyJWT, async (req, res) => {
  try {
    // 1️⃣ Total users (members + trainers + admin)
    const totalUsers = await usersCollection.countDocuments();

    // 2️⃣ Count trainers
    const totalTrainers = await usersCollection.countDocuments({ role: 'trainer' });

    // 3️⃣ Count members (role = member)
    const totalMembers = await usersCollection.countDocuments({ role: 'member' });

    // 4️⃣ Count subscribers
    const totalSubscribers = await subscriberCollection.countDocuments();

    // 5️⃣ Count total classes
    const totalClasses = await classCollection.countDocuments();

    // 6️⃣ Count reviews
    const totalReviews = await reviewCollection.countDocuments();

    // 7️⃣ Count forum posts
    const totalForums = await forumCollection.countDocuments();

    // 8️⃣ Return all in one object
    res.send({
      totalUsers,
      totalMembers,
      totalTrainers,
      totalSubscribers,
      totalClasses,
      totalReviews,
      totalForums
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).send({ message: 'Failed to load dashboard stats', error: error.message });
  }
});



    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res.clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })
    

  
    // Ping Command to Check MongoDB Deployment
    // await client.db('admin').command({ ping: 1 });
    // console.log('Pinged your deployment. MongoDB connection healthy 🚀');
 

// run();

app.get('/', (req, res) => {
  res.send('SparkFit Server running')
})

// // Start Server
app.listen(port, () => {
  console.log('SparkFit server Running');
});
