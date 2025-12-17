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
    const assignedAssetsCollection = db.collection("assignedAssets");
    const employeeAffiliationsCollection = db.collection(
      "employeeAffiliations"
    );

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
          return res.status(404).send({
            message: "User not found",
          });
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
        res.status(500).send({ message: "Failed to create request" });
      }
    });

    app.get("/requests", async (req, res) => {
      const { email } = req.query;
      try {
        const query = { hrEmail: email };
        const result = await requestsCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "unable to get requests" });
      }
    });

    // approve request api
    app.patch("/requests/:id/approve", async (req, res) => {
      const requestId = req.params.id;
      const { hrEmail } = req.body;

      try {
        // get request
        const requestQuery = { _id: new ObjectId(requestId) };
        const request = await requestsCollection.findOne(requestQuery);

        //  Deduct asset quantity

        const assetResult = await assetsCollection.updateOne(
          {
            _id: new ObjectId(request.assetId),
            availableQuantity: { $gt: 0 }, // safety check
          },
          {
            $inc: { availableQuantity: -1 },
          }
        );

        if (assetResult.modifiedCount === 0) {
          return res.status(400).send({ message: "Asset not available" });
        }

        //  Create assigned asset
        const assetImageDoc = await assetsCollection.findOne(
          { _id: new ObjectId(request.assetId) },
          { projection: { productImage: 1, _id: 0 } }
        );

        const dataToAssign = {
          assetId: request.assetId,
          assetName: request.assetName,
          assetImage: assetImageDoc?.productImage,
          assetType: request.assetType,
          employeeEmail: request.requesterEmail,
          employeeName: request.requesterName,
          hrEmail: request.hrEmail,
          companyName: request.companyName,
          assignmentDate: new Date(),
          returnDate: null,
          status: "assigned",
        };
        await assignedAssetsCollection.insertOne(dataToAssign);


        
        // Create affiliation if first time
        const affiliationQuery = {
          employeeEmail: request.requesterEmail,
          companyName: request.companyName,
        };
        const existingAffiliation =
          await employeeAffiliationsCollection.findOne(affiliationQuery);

        if (!existingAffiliation) {
          const companyLogoDoc = await usersCollection.findOne(
            { email: hrEmail },
            { projection: { companyLogo: 1, _id: 0 } }
          );

          const affiliationData = {
            employeeEmail: request.requesterEmail,
            employeeName: request.requesterName,
            hrEmail: request.hrEmail,
            companyLogo: companyLogoDoc?.companyLogo,
            companyName: request.companyName,
            affiliationDate: new Date(),
            status: "active",
          };
          await employeeAffiliationsCollection.insertOne(affiliationData);
        }

        // update request status
        await requestsCollection.updateOne(
          { _id: new ObjectId(requestId) },
          {
            $set: {
              requestStatus: "approved",
              approvalDate: new Date(),
              processedBy: hrEmail,
            },
          }
        );

        res.status(200).send({ message: "Request approved successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Approval failed" });
      }
    });


    // Reject Rquest 
    app.patch("/requests/:id/reject", async (req, res) => {
  const requestId = req.params.id;
  try {
    const result = await requestsCollection.updateOne(
      { _id: new ObjectId(requestId), requestStatus: "pending" },
      {
        $set: {
          requestStatus: "Rejected",
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(400)
        .send({ message: "Request already processed or not found" });
    }

    res.status(200).send({ message: "Request rejected successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Reject failed" });
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
