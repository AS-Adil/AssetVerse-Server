const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ova35yv.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("assetverse");
    const packagesCollection = db.collection("packages");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");

    app.get("/packages", async (req, res) => {
      try {
        const result = await packagesCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching packages:", error);
        return res.status(500).send({ message: "Failed to fetch packages" });
      }
    });

    // user related api
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        const email = user.email;
        const userExist = await usersCollection.findOne({ email });
        if (userExist) {
          return res.send({ message: "user already exist" });
        }

        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error("Error creating user:", error);
        return res.status(500).send({ message: "Failed to create user" });
      }
    });

    // get user role
    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;
      const query = { email };

      try {
        const user = await usersCollection.findOne(query);

        if (!user) {
          return res.send({ role: "employee" });
        }

        res.send({ role: user.role });
      } catch (error) {
        console.error(error);

        return res.status(500).send({
          message: "Failed to fetch user role",
        });
      }
    });

    app.get("/users", async (req, res) => {
      const { email } = req.query;
      const query = { email };

      try {
        const result = await usersCollection.findOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get user" });
      }
    });

    // ----------- assets related api --------------

    app.post("/assets", async (req, res) => {
      const asset = req.body;
      try {
        const result = await assetsCollection.insertOne(asset);
        res.status(201).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to add asset" });
      }
    });

    app.get("/assets", async (req, res) => {
      const { email, searchText } = req.query;
      let query = {};
      if (email) {
        query.hrEmail = email;
      }
      try {
        if (searchText && searchText.trim()) {
          query.productName = { $regex: searchText, $options: "i" };
        }
        const result = await assetsCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get Assets" });
      }
    });

    app.delete("/assets/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await assetsCollection.deleteOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res
          .status(500)
          .send({ message: "Failed to delete asset", error: error.message });
      }
    });

    app.patch("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      try {
        const query = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            ...updatedData,
            updatedAt: new Date(),
          },
        };

        const result = await assetsCollection.updateOne(query, updatedDoc);
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to update asset" });
      }
    });

    // requests related api
    app.post("/requests", async (req, res) => {
      const request = req.body;
      try {  
        const result = await requestsCollection.insertOne(request);
        res.status(201).send(result); 
      } catch (error) {
        console.error("Failed to create request:", error);
        res.status(500).send({ message: "Failed to create request"});
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("AssetVerse Server is Running !");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
