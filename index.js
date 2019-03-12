const apiai = require("apiai");
//Import Config file
const config = require("./config");
const express = require("express");
const bodyParser = require("body-parser");
const uuid = require("uuid");
const axios = require('axios');
const app = express();




const cli = require('./config/cli').console


//setting Port
app.set("port", process.env.PORT || 5000);

//serve static files in the public directory
app.use(express.static("public"));

// Process application/x-www-form-urlencoded
app.use(
  bodyParser.urlencoded({
    extended: false
  })
);

// Process application/json
app.use(bodyParser.json());

const apiAiService = apiai(config.API_AI_CLIENT_ACCESS_TOKEN, {
  language: "en",
  requestSource: "fb"
});
const sessionIds = new Map();

// Index route
app.get("/", function (req, res) {
  res.send("Hello world, I am a chat bot");
});

// for Facebook verification
app.get("/webhook/", function (req, res) {
  console.log("request");
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === config.FB_VERIFY_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

// Spin up the server
app.listen(app.get("port"), function () {
  console.log("Magic Started on port", app.get("port"));
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post("/webhook/", function (req, res) {
    var data = req.body;
    // Make sure this is a page subscription
    if (data.object == "page") {
      // Iterate over each entry
      // There may be multiple if batched
      data.entry.forEach(function (pageEntry) {
        var pageID = pageEntry.id;
        var timeOfEvent = pageEntry.time;

        // Iterate over each messaging event
        pageEntry.messaging.forEach(function (messagingEvent) {
          if (messagingEvent.message) {
            receivedMessage(messagingEvent);
            console.log("received message");
          } else if (messagingEvent.postback) {
            receivedPostback(messagingEvent);
            console.log("receive postback");
          } else {
            console.log("Webhook received unknown messagingEvent: ",messagingEvent);
          }
        });
      });
      // Assume all went well.
      // You must send back a 200, within 20 seconds
      res.sendStatus(200);
    }
  });

  function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    if (!sessionIds.has(senderID)) {
      sessionIds.set(senderID, uuid.v1());
    }
  console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));
  
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;

    if (messageText) {
      //send message to api.ai
      sendToApiAi(senderID, messageText);
    } else if (messageAttachments) {
      handleMessageAttachments(messageAttachments, senderID);
    }
  }

  function sendToApiAi(sender, text) {
    sendTypingOn(sender);
    let apiaiRequest = apiAiService.textRequest(text, {
      sessionId: sessionIds.get(sender)
    });

    apiaiRequest.on("response", response => {
      if (isDefined(response.result)) {
        handleApiAiResponse(sender, response);
        console.log(response);

      }
    });

    apiaiRequest.on("error", error => console.error(error));
    apiaiRequest.end();
  }

  function handleMessageAttachments(messageAttachments, senderID) {
    console.log(messageAttachments);

    //for now just reply
    sendTextMessage(senderID, "Attachment received. Thank you.");
  }



  /*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
  console.log(event);

  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;
  cli.blue(payload);
  handleApiAiAction(senderID, payload, "", "", "")
  switch (payload) {
    case "FACEBOOK_WELCOME":
      greetUserText(senderID);
      break;
    case "lunchmenu":
      handleApiAiAction(senderID, "lunch-menu");
      break;
    case "dinnermenu":
      handleApiAiAction(senderID, "dinner-menu");
      break;
    case "beveragesmenu":
      handleApiAiAction(senderID, "beverages-menu");
      break;
    case "quickbooking":
      handleApiAiAction(senderID, "newquickbooking");
      break;
    case "Today":
      handleApiAiAction(senderID, "quick-booking");
  }
  console.log(
    "Received postback for user %d and page %d with payload '%s' " + "at %d",
    senderID,
    recipientID,
    payload,
    timeOfPostback
  );

}

  /*
 * Turn typing indicator on
 *
 */
const sendTypingOn = (recipientId) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      sender_action: "typing_on"
    };
    callSendAPI(messageData);
  }

  /*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
const callSendAPI = async (messageData) => {

    const url = "https://graph.facebook.com/v3.0/me/messages?access_token=" + config.FB_PAGE_TOKEN;
      await axios.post(url, messageData)
        .then(function (response) {
          if (response.status == 200) {
            var recipientId = response.data.recipient_id;
            var messageId = response.data.message_id;
            if (messageId) {
              console.log(
                "Successfully sent message with id %s to recipient %s",
                messageId,
                recipientId
              );
            } else {
              console.log(
                "Successfully called Send API for recipient %s",
                recipientId
              );
            }
          }
        })
        .catch(function (error) {
          console.log(error.response.headers);
        });
    }

const isDefined = (obj) => {
        if (typeof obj == "undefined") {
          return false;
        }
        if (!obj) {
          return false;
        }
        return obj != null;
      }


    /*
 * Turn typing indicator off
 *
 */
const sendTypingOff = (recipientId) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      sender_action: "typing_off"
    };

    callSendAPI(messageData);
  }

  const sendTextMessage = async (recipientId, text) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        text: text
      }
    };
    await callSendAPI(messageData);
  }

  function handleApiAiResponse(sender, response) {
    let responseText = response.result.fulfillment.speech;
    let responseData = response.result.fulfillment.data;
    let messages = response.result.fulfillment.messages;
    let action = response.result.action;
    let contexts = response.result.contexts;
    let parameters = response.result.parameters;
   
    sendTypingOff(sender);
   
   if (responseText == "" && !isDefined(action)) {
      //api ai could not evaluate input.
      console.log("Unknown query" + response.result.resolvedQuery);
      sendTextMessage(
        sender,
        "I'm not sure what you want. Can you be more specific?"
      );
    } else if (isDefined(action)) {
      handleApiAiAction(sender, action, responseText, contexts, parameters);
    } else if (isDefined(responseData) && isDefined(responseData.facebook)) {
      try {
        console.log("Response as formatted message" + responseData.facebook);
        sendTextMessage(sender, responseData.facebook);
      } catch (err) {
        sendTextMessage(sender, err.message);
      }
    } else if (isDefined(responseText)) {
      sendTextMessage(sender, responseText);
    }
  }

  function handleApiAiAction(sender, action, responseText, contexts, parameters) {
    switch (action) {
     case "input.welcome":
       //var responseText = "This is example of Text message."
       sendTextMessage(sender, responseText);
       break;

     case "show-menu" :
       var elements = [{
         "title": "Our Menus",
         "subtitle": "We are pleased to offer you a wide-range of menu for lunch or dinner",
         "imageUrl": "https://image.freepik.com/free-vector/elegant-menu-cover-design_1048-9224.jpg",
         "buttons": [
          {
             "text": "LUNCH MENU",
             "postback": "lunchmenu"
           }, {
            "text": "DINNER MENU",
            "postback": "dinnermenu"
          }, {
            "text": "BEVERAGES",
            "postback": "beveragesmenu"
          }
        ]
       }, {
         "title": "Hours and Directions",
         "imageUrl": "https://image.freepik.com/free-photo/wooden-planks-with-blurred-restaurant-background_1253-56.jpg",
         "subtitle": "Mon-SUN 11:00 AM - 11:00PM",
         "buttons": [
           {
             "postback": "https://goo.gl/maps/asxsLN5WbX12",
             "text": "SHOW DIRECTIONs"
           }, {
             "text": "RESERVE A TABLE",
             "postback": "quickbooking"
           }
         ]
       },{
         "title": "GIVE US FEEDBACK!",
         "imageUrl": "https://image.freepik.com/free-vector/customer-satisfaction-design_23-2147944267.jpg",
         "subtitle": "Give us feedback let us improve for greater.",
         "buttons": [
           {
             "postback": "https://f1948e04.ngrok.io",
             "text": "View Website"
           }, {
             "text": "Start Chatting",
             "postback": "PAYLOAD EXAMPLE"
           }
         ]
       }];
       handleCardMessages(elements, sender)
     break;

     case "lunch-menu" :
     var elements = [{
       "title": "Lunch Favorites",
       //"subtitle": "A half-pound of BBQ pulled pork piled over creamy macaroni & cheese and our cheddar cornbread waffle topped with maple butter. ",
       "imageUrl": "https://image.freepik.com/free-photo/closeup-italian-food-dinner_53876-47143.jpg",
       "buttons": [
         {
           "text": "Show Lunch Favorites",
           "postback": "lunch-favorites"
         }
       ]
     }, {
       "title": "Burgers",
       "imageUrl": "https://image.freepik.com/free-photo/two-fresh-homemade-burgers-with-fried-potatoes-orange-juice_79782-12.jpg",
       //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
       "buttons": [
         {
           "text": "Show Burgers",
           "postback": "burgers"
         }
       ]
     },{
       "title": "Sandwiches",
       "imageUrl": "https://image.freepik.com/free-photo/sandwich_1339-1113.jpg",
       //"subtitle": "Give us feedback let us improve for greater.",
       "buttons": [
         {
           "text": "Show Sandwiches",
           "postback": "sandwiches"
         }
       ]
     }];
     handleCardMessages(elements, sender)
   break;

     case "dinner-menu" :
     var elements = [{
       "title": "Appetizers",
       //"subtitle": "A half-pound of BBQ pulled pork piled over creamy macaroni & cheese and our cheddar cornbread waffle topped with maple butter. ",
       "imageUrl": "https://image.freepik.com/free-photo/pieces-bread-with-cheese-tomato_1205-388.jpg?1",
       "buttons": [
         {
           "text": "Show Appetizers",
           "postback": "appetizers"
         }
       ]
     }, {
       "title": "Main Course",
       "imageUrl": "https://image.freepik.com/free-photo/closeup-pork-ribs-steak-wooden-board-food-styling_53876-16202.jpg",
       //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
       "buttons": [
         {
           "text": "Show Main Course",
           "postback": "maincourse"
         }
       ]
     },{
       "title": "Sandwiches",
       "imageUrl": "https://image.freepik.com/free-photo/sandwich_1339-1113.jpg",
       //"subtitle": "Give us feedback let us improve for greater.",
       "buttons": [
         {
           "text": "Show Sandwiches",
           "postback": "sandwiches"
         }
       ]
     }];
     handleCardMessages(elements, sender)
   break;

    case "beverages-menu" :
   var elements = [{
     "title": "Freshly Ground Coffee",
     //"subtitle": "A half-pound of BBQ pulled pork piled over creamy macaroni & cheese and our cheddar cornbread waffle topped with maple butter. ",
     "imageUrl": "https://image.freepik.com/free-photo/cup-coffee-with-heart-drawn-foam_1286-70.jpg?1",
     "buttons": [
      {
        "text": "Show Main Course",
        "postback": "maincourse"
      }
    ]
    }, {
     "title": "Flavored Coffee",
     "imageUrl": "https://image.freepik.com/free-photo/coffee-cup-coffee-beans-table-top-view-love-coffee-brown-coffee-beans-isolated-white-background-hot-coffee-cup-with-coffee-beans_1391-99.jpg",
     //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
     "buttons": [
      {
        "text": "Show Main Course",
        "postback": "maincourse"
      }
    ]
   }, {
     "title": "Freshly Brewed Iced Tea",
     "imageUrl": "https://image.freepik.com/free-photo/tea-with-mint-lemon-selective-focus_73944-5450.jpg",
     //"subtitle": "Give us feedback let us improve for greater.",
     "buttons": [
      {
        "text": "Show Main Course",
        "postback": "maincourse"
      }
    ]
   }/*, {
      "title": "Flavored Tea",
      "imageUrl": "https://img.freepik.com/free-photo/tea-with-lemon-wooden-stand-with-cookies_78826-324.jpg?size=626&ext=jpg",
      //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
      "buttons": [
        {
          "text": "Show Main Course",
          "postback": "maincourse"
        }
      ]
    },{
    }, {
      "title": "Hot Herbal Tea",
      "imageUrl": "https://img.freepik.com/free-photo/tasty-fresh-green-tea-glass-teapot-ceremony-old-rustic-table_1220-1753.jpg?size=626&ext=jpg",
      //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
      "buttons": [
        {
          "text": "Show Main Course",
          "postback": "maincourse"
        }
      ]
    },{
    }, {
      "title": "Fresh Juices",
      "imageUrl": "https://image.freepik.com/free-photo/waterlemon-orange-juice-drinking-glass_74190-2215.jpg",
      //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
      "buttons": [
        {
          "text": "Show Main Course",
          "postback": "maincourse"
        }
      ]
    },{
    }, {
      "title": "Soft Drinks",
      "imageUrl": "https://image.freepik.com/free-photo/glass-cola-with-ice_1339-2536.jpg",
      //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
      "buttons": [
        {
          "text": "Show Main Course",
          "postback": "maincourse"
        }
      ]
    },{
    }, {
      "title": "White or Chocolate Milk",
      "imageUrl": "https://image.freepik.com/free-photo/dark-white-chocolate-bar-with-coffee-glass-dual-backdrop_23-2147906621.jpg",
      //"subtitle": "Mon-SUN 11:00 AM - 11:00PM",
      "buttons": [
        {
          "text": "Show Main Course",
          "postback": "maincourse"
        }
      ]
    }*/];
   handleCardMessages(elements, sender)
 break;
 
 case "quickbooking":
     var responseText = "Thank you for using our booking service. Which day do want to booking?"
     var replies = [{
         "content_type": "text",
         "title": "Today",
         "payload": "Today",
     },
     {
         "content_type": "text",
         "title": "Tomorrow",
         "payload": "tomorrow",
     },
     {
         "content_type": "text",
         "title": "Next two day",
         "payload": "nexttwoday",
     }];
     sendQuickReply(sender, responseText, replies)
 break;

 case "quick-booking":
 var responseText = "How many people?"
 var replies = [{
     "content_type": "text",
     "title": "1",
     "payload": "today",
 },
 {
     "content_type": "text",
     "title": "2",
     "payload": "tomorrow",
 },
 {
     "content_type": "text",
     "title": "3",
     "payload": "nexttwoday",
 }];
 sendQuickReply(sender, responseText, replies)
break;
     default:
       //unhandled action, just send back the text
     sendTextMessage(sender, responseText);
   }
 }

 
 async function handleCardMessages(messages, sender) {
    let elements = [];
    for (var m = 0; m < messages.length; m++) {
      let message = messages[m];
      let buttons = [];
      for (var b = 0; b < message.buttons.length; b++) {
        let isLink = message.buttons[b].postback.substring(0, 4) === "http";
        let button;
        if (isLink) {
          button = {
            type: "web_url",
            title: message.buttons[b].text,
            url: message.buttons[b].postback
          };
        } else {
          button = {
            type: "postback",
            title: message.buttons[b].text,
            payload: message.buttons[b].postback
          };
        }
        buttons.push(button);
      }
      let element = {
        title: message.title,
        image_url: message.imageUrl,
        subtitle: message.subtitle,
        buttons: buttons
      };
      elements.push(element);
    }
    await sendGenericMessage(sender, elements);
  }

  const sendGenericMessage = async (recipientId, elements) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: elements
          }
        }
      }
    };
    await callSendAPI(messageData);
  }

  const sendQuickReply = async (recipientId, text, replies, metadata) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        text: text,
        metadata: isDefined(metadata) ? metadata : "",
        quick_replies: replies
      }
    };
    await callSendAPI(messageData);
  }



