import {
  composeContext,
  elizaLogger,
  ModelClass,
  stringToUuid,
  UUID,
} from "@elizaos/core";
import {
  ActionExample,
  generateText,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";
import { ClientBase } from "./twitter-base-provider";
import { SearchMode, Tweet } from "agent-twitter-client";
import { CookieTweet } from "../../types/TwitterTypes";

const SCRAPE_BATCH_SIZE = 10;

export class TwitterInteractionClient {
  client: ClientBase;
  runtime: IAgentRuntime;
  collectedTweets: Tweet[];
  targetUserChunks: string[][];

  currentChunkIndex: number;
  constructor(client: ClientBase, runtime: IAgentRuntime) {
    this.client = client;
    this.runtime = runtime;
    this.collectedTweets = [];
    // Aufteilen der konfigurierten User in Batches
    this.targetUserChunks = [];
    // Index, welcher Chunk als nächstes verarbeitet wird
    this.currentChunkIndex = 0;
  }

  putAccountsIntoChunks(accounts: string[]) {
    this.targetUserChunks = this.chunkArray(accounts, SCRAPE_BATCH_SIZE);
  }

  private chunkArray(array: string[], size: number) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  /**
   * Fetches tweet contents based on an array of tweet IDs.
   */
  async fetchTweetsById(tweetIds: string[]): Promise<Tweet[]> {
    const allValidTweets = [];

    for (const tweetId of tweetIds) {
      try {
        // Fetch individual tweet content
        const tweet = await this.client.twitterClient.getTweet(tweetId);

        if (tweet) {
          elizaLogger.log(`📜 Retrieved tweet content: ${tweet.text}`);
          allValidTweets.push(tweet);
        }
      } catch (error) {
        elizaLogger.error(`❌ Error retrieving tweet ${tweetId}:`, error);
        continue;
      }
    }

    return allValidTweets;
  }

  public async analyzeSentiment(searchterm: string, tweets: CookieTweet[]) {
    try {
      if (!tweets || tweets.length === 0) {
        throw new Error("❌ No tweets provided for sentiment analysis.");
      }

      // Vorbereiten einer Connection und State
      const roomId = stringToUuid(this.runtime.agentId);
      // Tweets formattieren
      const formattedTweets = tweets
        .map(
          (tweet, index) => `📝 Tweet #${index + 1}
      📅 Datum: ${tweet.createdAt}
      👤 Autor: ${tweet.authorUsername}
      🔹 Likes: ${tweet.likesCount}, Retweets: ${
            tweet.retweetsCount
          }, Replies: ${tweet.repliesCount}
      🔹 Impressions: ${tweet.impressionsCount}, Engagements: ${
            tweet.engagementsCount
          }
      🔹 Matching Score: ${tweet.matchingScore}
      🗣 Text: "${tweet.text}"
      ------------------------------------------------`
        )
        .join("\n\n");

      elizaLogger.log(
        "🔍 Formatted Tweets for Sentiment Analysis:",
        formattedTweets
      );

      // Zustand für das LLM vorbereiten
      const state = await this.runtime.composeState({
        userId: this.runtime.agentId,
        roomId: roomId,
        agentId: this.runtime.agentId,
        content: { text: formattedTweets },
      });

      // Kontext für die Sentiment-Analyse erstellen
      const buySignalContext = composeContext({
        state,
        template: `
         Here are some recent tweets:
         ${formattedTweets}
          
         Task:
         - Analyze the most relevant topics from the tweets.
         - Check the sentiment regarding ${searchterm}. 
         - Check if the tweets suggest a buy signal for ${searchterm} or not.
  
         Respond only with buy or no buy based on the sentiment analysis no other text is needed. This is a strict requirement.
        `,
      });

      // Sentiment-Analyse mit LLM durchführen
      const shouldBuy = await generateText({
        runtime: this.runtime,
        context: buySignalContext,
        modelClass: ModelClass.SMALL, // Upgrade to MEDIUM/LARGE if needed
      });

      elizaLogger.log(
        `📊 Sentiment Analysis Result for ${searchterm}:`,
        shouldBuy
      );

      // Kontext für Tweet-Generierung
      const context = composeContext({
        state,
        template: `
          Here are some recent tweets:
          ${formattedTweets}
  
          We already analyzed the sentiment regarding ${searchterm}.
          We found, that we should ${shouldBuy} ${searchterm}.
          
          Task:
          - Analyze the most relevant topics from the tweets.
          - Create a short and engaging Twitter post.
          - The tweet must be **186 characters or less** (strict limit).
          - Keep it concise, impactful, and aligned with crypto trends.
          - Avoid generic statements—provide insights or a bold statement.
          - Add why we currently ${shouldBuy} ${searchterm} in the tweet.
          - **Do NOT add quotation marks or any extra formatting around the tweet.** Just return the text.
          
          Example format:
          🔥 $TOKEN just hit a new high! 🚀 On-chain data shows a 35% volume spike. Totally a buy in here! #Crypto #DeFi
      
          Respond with only the tweet text, nothing else.
        `,
      });

      // Tweet generieren
      const summary = await generateText({
        runtime: this.runtime,
        context,
        modelClass: ModelClass.SMALL, // Upgrade to MEDIUM/LARGE if needed
      });

      elizaLogger.log("📢 Generated Tweet:", summary);

      if (!summary || summary.length === 0) {
        throw new Error("❌ No tweet generated, aborting.");
      }

      // **Tweet posten**
      await this.postTweet(summary);
      elizaLogger.log("✅ Tweet successfully posted!");

      return shouldBuy === "buy";
    } catch (error) {
      elizaLogger.error("❌ Error in analyzeSentiment:", {
        message: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Generates a Twitter post based on fetched tweets and posts it.
   */
  async generateAndPostTweet(tweetContents: Tweet[], roomId: UUID) {
    // Check if there are valid tweets to process
    if (!tweetContents || tweetContents.length === 0) {
      elizaLogger.log("❌ No tweets found, nothing to post.");
      return;
    }

    elizaLogger.log("✅ Loaded tweets for processing:", tweetContents.length);

    // Format tweets into a readable structure for AI processing
    const combinedText = tweetContents
      .map((tweet) => `${tweet.username}: "${tweet.text}"`)
      .join("\n\n");

    // Prepare the state for the LLM (Language Model) to generate a tweet
    const state = await this.runtime.composeState({
      userId: this.runtime.agentId,
      roomId: roomId,
      agentId: this.runtime.agentId,
      content: { text: combinedText },
    });

    // Define the LLM prompt for tweet generation
    const context = composeContext({
      state,
      template: `
        Here are some recent tweets:
        ${combinedText}
        
        Task:
    
        - Analyze the most relevant topics from the tweets.
        - Create a short and engaging Twitter post.
        - The tweet must be **186 characters or less** (strict limit).
        - Keep it concise, impactful, and aligned with crypto trends.
        - Avoid generic statements—provide insights or a bold statement.
        - **Do NOT add quotation marks or any extra formatting around the tweet.** Just return the text.
        
        Example format:
        🔥 $TOKEN just hit a new high! 🚀 On-chain data shows a 35% volume spike. #Crypto #DeFi
    
        Respond with only the tweet text, nothing else.
      `,
    });

    // Generate the tweet using the AI model
    const summary = await generateText({
      runtime: this.runtime,
      context,
      modelClass: ModelClass.SMALL, // Upgrade to MEDIUM/LARGE if needed
    });

    elizaLogger.log("📢 Generated Tweet:", summary);

    // Check if the generated tweet is valid
    if (!summary || summary.length === 0) {
      elizaLogger.log("❌ No tweet generated, aborting.");
      return;
    }

    // 🚀 **Post the generated tweet**
    await this.postTweet(summary);
  }

  /**
   * Ruft den nächsten Batch von Twitter-Usern ab, holt deren Tweets,
   * filtert sie und speichert sie in `this.collectedTweets`.
   */
  async handleTwitterBatch() {
    if (this.targetUserChunks.length === 0) {
      elizaLogger.error("No target users configured, aborting.");
      return "";
    }

    const processBatch = async () => {
      if (this.currentChunkIndex >= this.targetUserChunks.length) {
        elizaLogger.log("All chunks processed, summarizing tweets...");
        const summarizedTweets =
          await this.processAndSummarizeCollectedTweets();
        return summarizedTweets;
      }

      const usersToFetch = this.targetUserChunks[this.currentChunkIndex] || [];
      elizaLogger.log(
        `Processing chunk ${this.currentChunkIndex + 1}/${
          this.targetUserChunks.length
        }:`,
        usersToFetch
      );

      try {
        const newTweets = await this.fetchAndFilterTweets(usersToFetch);
        elizaLogger.log(
          `New tweets found in chunk ${this.currentChunkIndex + 1}:`,
          newTweets.length
        );
        this.collectedTweets.push(...newTweets);
      } catch (error) {
        elizaLogger.error("Error collecting tweets: ", error);
      }

      this.currentChunkIndex++;

      // Nächsten Batch nach 5 Minuten ausführen
      setTimeout(processBatch, 5 * 60 * 1000);
    };

    // Starte den Prozess
    processBatch();
  }

  async postTweet(content: string) {
    if (!content || content.length === 0) {
      elizaLogger.log("❌ Kein Tweet-Inhalt vorhanden, Abbruch.");
      return;
    }

    // ✂️ Kürze den Tweet, falls er zu lang ist
    if (content.length > 280) {
      content = content.slice(0, 277) + "...";
      elizaLogger.log(`✂️ Tweet war zu lang, gekürzt: "${content}"`);
    }

    try {
      const response = await this.client.twitterClient.sendTweet(content);

      const body = await response.json();

      const tweetId = body?.data?.create_tweet?.tweet_results?.result?.rest_id;

      if (!tweetId) {
        elizaLogger.error(
          "❌ Fehler beim Tweet-Posten, keine ID zurückgegeben:",
          body
        );
        return;
      }

      elizaLogger.log(`✅ Tweet erfolgreich gepostet! ID: ${tweetId}`);

      elizaLogger.log("✅ Tweet erfolgreich gepostet:", body);
      return body;
    } catch (error) {
      elizaLogger.error("❌ Fehler beim Posten des Tweets:", error);
    }
  }

  /**
   * Fragt Twitter nach neuesten Tweets der gegebenen User ab,
   * filtert sie anhand deiner Kriterien (z.B. isReply, isRetweet, Zeitfenster)
   * und gibt die validen Tweets zurück.
   */
  async fetchAndFilterTweets(usersArray: string[]): Promise<Tweet[]> {
    const allValidTweets = [];

    for (const username of usersArray) {
      try {
        // Beispiel: Fetch 3 neueste Tweets des Nutzers
        const userTweets = (
          await this.client.twitterClient.fetchSearchTweets(
            `from:${username}`,
            3,
            SearchMode.Latest
          )
        ).tweets;

        // Filterkriterien
        const validTweets = userTweets.filter((tweet) => {
          const isUnprocessed =
            !this.client.lastCheckedTweetId ||
            BigInt(tweet.id) > this.client.lastCheckedTweetId;
          const isRecent =
            Date.now() - tweet.timestamp * 1000 < 2 * 60 * 60 * 1000; // 2 Stunden

          elizaLogger.log(`Tweet ${tweet.id} checks:`, {
            isUnprocessed,
            isRecent,
            isReply: tweet.isReply,
            isRetweet: tweet.isRetweet,
          });

          return (
            isUnprocessed && !tweet.isReply && !tweet.isRetweet && isRecent
          );
        });

        if (validTweets.length > 0) {
          elizaLogger.log(
            `Gefundene gültige Tweets von ${username}:`,
            validTweets.length
          );
          allValidTweets.push(...validTweets);
        }
      } catch (error) {
        elizaLogger.error(
          `Fehler beim Abfragen der Tweets für ${username}:`,
          error
        );
        continue;
      }
    }

    // Sortiere gefundene Tweets aufsteigend nach ID und entferne ggf. eigene
    const tweetCandidates = allValidTweets
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((tweet) => tweet.userId !== this.client.profile.id);

    return tweetCandidates;
  }

  async buildConversationThread(tweet: Tweet, maxReplies = 10) {
    const thread = [];
    const visited = new Set();

    const processThread = async (currentTweet, depth = 0) => {
      if (!currentTweet || depth >= maxReplies) return;

      const memory = await this.runtime.messageManager.getMemoryById(
        stringToUuid(currentTweet.id + "-" + this.runtime.agentId)
      );

      if (!memory && !visited.has(currentTweet.id)) {
        visited.add(currentTweet.id);
        thread.unshift(currentTweet);

        if (currentTweet.inReplyToStatusId) {
          try {
            const parentTweet = await this.client.twitterClient.getTweet(
              currentTweet.inReplyToStatusId
            );
            await processThread(parentTweet, depth + 1);
          } catch (error) {
            elizaLogger.error("Error fetching parent tweet:", error);
          }
        }
      }
    };

    await processThread(tweet);
    return thread;
  }

  private async processAndSummarizeCollectedTweets() {
    elizaLogger.log("Starte Prozessierung der gesammelten Tweets.");

    // Wenn keine neuen Tweets vorliegen, abbrechen
    if (this.collectedTweets.length === 0) {
      elizaLogger.log(
        "Keine gesammelten Tweets vorhanden, keine Zusammenfassung."
      );
      return;
    }

    // 1) Baue für jeden neuen Tweet optional den Conversation-Thread
    // 2) Erstelle State, Memory-Einträge, etc.

    const processedTweets = [];
    for (const tweet of this.collectedTweets) {
      // Check, ob Tweet bereits verarbeitet wurde
      const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);
      const existingResponse = await this.runtime.messageManager.getMemoryById(
        tweetId
      );

      if (existingResponse) {
        elizaLogger.log(
          `Tweet ${tweet.id} wurde bereits verarbeitet, überspringe.`
        );
        continue;
      }

      // Baue Conversation-Thread (falls gewünscht/erforderlich)
      const thread = await this.buildConversationThread(tweet);

      elizaLogger.log("Neuer Tweet gefunden:", tweet.permanentUrl);

      if (thread.length === 1 && thread[0].id === tweet.id) {
        elizaLogger.log("Einzel-Tweet ohne vorherige Konversation:", tweet.id);
        processedTweets.push({ tweet, thread: null });
      } else {
        elizaLogger.log("Thread aufgebaut:", thread);
        processedTweets.push({ tweet, thread });
      }

      // Vorbereiten einer Connection und State
      const roomId = stringToUuid(
        tweet.conversationId + "-" + this.runtime.agentId
      );
      const userIdUUID =
        tweet.userId === this.client.profile.id
          ? this.runtime.agentId
          : stringToUuid(tweet.userId);

      await this.runtime.ensureConnection(
        userIdUUID,
        roomId,
        tweet.username,
        tweet.name,
        "twitter"
      );

      const state = await this.runtime.composeState(
        {
          id: tweetId,
          agentId: this.runtime.agentId,
          content: {
            text: tweet.text,
            url: tweet.permanentUrl,
          },
          userId: userIdUUID,
          roomId,
          createdAt: tweet.timestamp * 1000,
        },
        {
          twitterClient: this.client.twitterClient,
          twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
          currentPost: tweet.text,
          formattedConversation: thread
            .map(
              (twt) =>
                `@${twt.username} (${new Date(
                  twt.timestamp * 1000
                ).toLocaleString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}):\n${twt.text}`
            )
            .join("\n\n"),
        }
      );

      // Speichere die Anfrage im internen System
      this.client.saveRequestMessage(
        {
          id: tweetId,
          agentId: this.runtime.agentId,
          content: {
            text: tweet.text,
            url: tweet.permanentUrl,
          },
          userId: userIdUUID,
          roomId,
          createdAt: tweet.timestamp * 1000,
        },
        state
      );
    }

    // Alle verarbeiteten Tweets in einem String zusammenfassen
    const allTexts = processedTweets.map(
      (item) =>
        `${item.tweet.username}: ${item.tweet.text} [Link](${item.tweet.permanentUrl})`
    );

    const combinedText = allTexts.join("\n\n");

    if (!combinedText) {
      elizaLogger.log(
        "Keine neuen verarbeiteten Tweets vorhanden, Zusammenfassung entfällt."
      );
      return;
    }

    elizaLogger.log("Generated summary");
    return combinedText;
  }

  async createTweet(combinedText: string) {
    const roomId = stringToUuid(
      "twitter_generate_room-" + this.client.profile.username
    );

    // State für den Summarizer erzeugen (kombinierter Text).
    const state = await this.runtime.composeState({
      userId: this.runtime.agentId,
      roomId: roomId,
      agentId: this.runtime.agentId,
      content: { text: combinedText },
    });

    const context = composeContext({
      state,
      template: `
        Here are some recent tweets:
        ${combinedText}
        
        Task:
        
        1. Analyze each tweet in detail and extract the specific information mentioned (e.g., data points, quotes, claims, or observations).
        2. Organize the topics by relevance, scoring the relevance based on the number of mentions or depth of discussion.
        3. Summarize each relevant topic by providing specific details mentioned in the tweets.
        4. Identify the authors of the tweets and attribute the details to them.
        5. Make the summary concise yet detailed enough to understand the key takeaways of each tweet.
      
        Output format condensed as a twitter message.
        `,
    });

    // Generiere eine Zusammenfassung mit dem LLM/Modell deiner Wahl
    const summary = await generateText({
      runtime: this.runtime,
      context,
      modelClass: ModelClass.SMALL, // hier ggf. anpassen
    });

    elizaLogger.log("Generated tweet:", summary);

    return summary;
  }

  // async handleTwitterInteractions() {
  //   elizaLogger.log("Checking Twitter interactions");

  //   const twitterUsername = this.client.profile.username;
  //   try {
  //     let uniqueTweetCandidates = [];
  //     // Only process target users if configured
  //     if (this.client.twitterConfig.TWITTER_TARGET_USERS.length) {
  //       const TARGET_USERS = this.client.twitterConfig.TWITTER_TARGET_USERS;

  //       elizaLogger.log("Processing target users:", TARGET_USERS);

  //       if (TARGET_USERS.length > 0) {
  //         // Create a map to store tweets by user
  //         const tweetsByUser = new Map<string, Tweet[]>();

  //         // Fetch tweets from all target users
  //         for (const username of TARGET_USERS) {
  //           try {
  //             const userTweets = (
  //               await this.client.twitterClient.fetchSearchTweets(
  //                 `from:${username}`,
  //                 3,
  //                 SearchMode.Latest
  //               )
  //             ).tweets;

  //             // Filter for unprocessed, non-reply, recent tweets
  //             const validTweets = userTweets.filter((tweet) => {
  //               const isUnprocessed =
  //                 !this.client.lastCheckedTweetId ||
  //                 parseInt(tweet.id) > this.client.lastCheckedTweetId;
  //               const isRecent =
  //                 Date.now() - tweet.timestamp * 1000 < 2 * 60 * 60 * 1000;

  //               elizaLogger.log(`Tweet ${tweet.id} checks:`, {
  //                 isUnprocessed,
  //                 isRecent,
  //                 isReply: tweet.isReply,
  //                 isRetweet: tweet.isRetweet,
  //               });

  //               return (
  //                 isUnprocessed &&
  //                 !tweet.isReply &&
  //                 !tweet.isRetweet &&
  //                 isRecent
  //               );
  //             });

  //             if (validTweets.length > 0) {
  //               tweetsByUser.set(username, validTweets);
  //               elizaLogger.log(
  //                 `Found ${validTweets.length} valid tweets from ${username}`
  //               );
  //             }
  //           } catch (error) {
  //             elizaLogger.error(
  //               `Error fetching tweets for ${username}:`,
  //               error
  //             );
  //             continue;
  //           }
  //         }

  //         //DAS BRAUCHE ICH NICHT ICH WILL ALLE BEHALTEN

  //         // Select one tweet from each user that has tweets
  //         const selectedTweets: Tweet[] = [];
  //         for (const [username, tweets] of tweetsByUser) {
  //           if (tweets.length > 0) {
  //             //TODO: HERE NO RANDOM TWEET - WE WANT TO KEEP ALL TWEETS
  //             const randomTweet =
  //               tweets[Math.floor(Math.random() * tweets.length)];
  //             selectedTweets.push(randomTweet);
  //             elizaLogger.log(
  //               `Selected tweet from ${username}: ${randomTweet.text?.substring(
  //                 0,
  //                 100
  //               )}`
  //             );
  //           }
  //         }

  //         // Add selected tweets to candidates
  //         uniqueTweetCandidates = [...selectedTweets];
  //       }
  //     } else {
  //       elizaLogger.log("No target users configured, processing only mentions");
  //     }

  //     // Sort tweet candidates by ID in ascending order
  //     uniqueTweetCandidates
  //       .sort((a, b) => a.id.localeCompare(b.id))
  //       .filter((tweet) => tweet.userId !== this.client.profile.id);

  //     // for each tweet candidate, handle the tweet
  //     // I WANT TO GET A CONVERSATION THREAD FOR EACH TWEET BUT NOT RESPOND
  //     // BRING THE TWEET BACK INTO A FINAL FORM FOR STORING IN MEMORY
  //     // RESULTING SHOULD BE A OBJECT CONTAINING ALL TWEETS
  //     for (const tweet of uniqueTweetCandidates) {
  //       if (
  //         !this.client.lastCheckedTweetId ||
  //         BigInt(tweet.id) > this.client.lastCheckedTweetId
  //       ) {
  //         // Generate the tweetId UUID the same way it's done in handleTweet
  //         const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);

  //         // Check if we've already processed this tweet
  //         const existingResponse =
  //           await this.runtime.messageManager.getMemoryById(tweetId);

  //         if (existingResponse) {
  //           elizaLogger.log(`Already responded to tweet ${tweet.id}, skipping`);
  //           continue;
  //         }
  //         elizaLogger.log("New Tweet found", tweet.permanentUrl);

  //         const roomId = stringToUuid(
  //           tweet.conversationId + "-" + this.runtime.agentId
  //         );

  //         const userIdUUID =
  //           tweet.userId === this.client.profile.id
  //             ? this.runtime.agentId
  //             : stringToUuid(tweet.userId!);

  //         await this.runtime.ensureConnection(
  //           userIdUUID,
  //           roomId,
  //           tweet.username,
  //           tweet.name,
  //           "twitter"
  //         );

  //         const thread = await buildConversationThread(tweet, this.client);

  //         const message = {
  //           content: { text: tweet.text },
  //           agentId: this.runtime.agentId,
  //           userId: userIdUUID,
  //           roomId,
  //         };

  //         await this.handleTweet({
  //           tweet,
  //           message,
  //           thread,
  //         });

  //         // Update the last checked tweet ID after processing each tweet
  //         this.client.lastCheckedTweetId = BigInt(tweet.id);
  //       }
  //     }

  //     // Save the latest checked tweet ID to the file
  //     await this.client.cacheLatestCheckedTweetId();

  //     elizaLogger.log("Finished checking Twitter interactions");
  //   } catch (error) {
  //     elizaLogger.error("Error handling Twitter interactions:", error);
  //   }
  // }

  // private async handleTweet({
  //   tweet,
  //   message,
  //   thread,
  // }: {
  //   tweet: Tweet;
  //   message: Memory;
  //   thread: Tweet[];
  // }) {
  //   if (tweet.userId === this.client.profile.id) {
  //     // console.log("skipping tweet from bot itself", tweet.id);
  //     // Skip processing if the tweet is from the bot itself
  //     return;
  //   }

  //   if (!message.content.text) {
  //     elizaLogger.log("Skipping Tweet with no text", tweet.id);
  //     return { text: "", action: "IGNORE" };
  //   }

  //   elizaLogger.log("Processing Tweet: ", tweet.id);
  //   const formatTweet = (tweet: Tweet) => {
  //     return `  ID: ${tweet.id}
  // From: ${tweet.name} (@${tweet.username})
  // Text: ${tweet.text}`;
  //   };
  //   const currentPost = formatTweet(tweet);

  //   elizaLogger.debug("Thread: ", thread);
  //   const formattedConversation = thread
  //     .map(
  //       (tweet) => `@${tweet.username} (${new Date(
  //         tweet.timestamp * 1000
  //       ).toLocaleString("en-US", {
  //         hour: "2-digit",
  //         minute: "2-digit",
  //         month: "short",
  //         day: "numeric",
  //       })}):
  //       ${tweet.text}`
  //     )
  //     .join("\n\n");

  //   elizaLogger.debug("formattedConversation: ", formattedConversation);

  //   let state = await this.runtime.composeState(message, {
  //     twitterClient: this.client.twitterClient,
  //     twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
  //     currentPost,
  //     formattedConversation,
  //   });

  //   // check if the tweet exists, save if it doesn't
  //   const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);
  //   const tweetExists = await this.runtime.messageManager.getMemoryById(
  //     tweetId
  //   );

  //   if (!tweetExists) {
  //     elizaLogger.log("tweet does not exist, saving");
  //     const userIdUUID = stringToUuid(tweet.userId as string);
  //     const roomId = stringToUuid(tweet.conversationId);

  //     const message = {
  //       id: tweetId,
  //       agentId: this.runtime.agentId,
  //       content: {
  //         text: tweet.text,
  //         url: tweet.permanentUrl,
  //         inReplyTo: tweet.inReplyToStatusId
  //           ? stringToUuid(tweet.inReplyToStatusId + "-" + this.runtime.agentId)
  //           : undefined,
  //       },
  //       userId: userIdUUID,
  //       roomId,
  //       createdAt: tweet.timestamp * 1000,
  //     };
  //     this.client.saveRequestMessage(message, state);
  //   }

  //   // get usernames into str
  //   const validTargetUsersStr =
  //     this.client.twitterConfig.TWITTER_TARGET_USERS.join(",");

  //   const shouldRespondContext = composeContext({
  //     state,
  //     template:
  //       this.runtime.character.templates?.twitterShouldRespondTemplate ||
  //       this.runtime.character?.templates?.shouldRespondTemplate ||
  //       twitterShouldRespondTemplate(validTargetUsersStr),
  //   });

  //   const shouldRespond = await generateShouldRespond({
  //     runtime: this.runtime,
  //     context: shouldRespondContext,
  //     modelClass: ModelClass.MEDIUM,
  //   });

  //   // Promise<"RESPOND" | "IGNORE" | "STOP" | null> {
  //   if (shouldRespond !== "RESPOND") {
  //     elizaLogger.log("Not responding to message");
  //     return { text: "Response Decision:", action: shouldRespond };
  //   }

  //   const context = composeContext({
  //     state,
  //     template:
  //       this.runtime.character.templates?.twitterMessageHandlerTemplate ||
  //       this.runtime.character?.templates?.messageHandlerTemplate ||
  //       twitterMessageHandlerTemplate,
  //   });

  //   elizaLogger.debug("Interactions prompt:\n" + context);

  //   const response = await generateMessageResponse({
  //     runtime: this.runtime,
  //     context,
  //     modelClass: ModelClass.LARGE,
  //   });

  //   const removeQuotes = (str: string) => str.replace(/^['"](.*)['"]$/, "$1");

  //   const stringId = stringToUuid(tweet.id + "-" + this.runtime.agentId);

  //   response.inReplyTo = stringId;

  //   response.text = removeQuotes(response.text);

  //   if (response.text) {
  //     try {
  //       const callback: HandlerCallback = async (response: Content) => {
  //         const memories = await sendTweet(
  //           this.client,
  //           response,
  //           message.roomId,
  //           this.client.twitterConfig.TWITTER_USERNAME,
  //           tweet.id
  //         );
  //         return memories;
  //       };

  //       const responseMessages = await callback(response);

  //       state = (await this.runtime.updateRecentMessageState(state)) as State;

  //       for (const responseMessage of responseMessages) {
  //         if (
  //           responseMessage === responseMessages[responseMessages.length - 1]
  //         ) {
  //           responseMessage.content.action = response.action;
  //         } else {
  //           responseMessage.content.action = "CONTINUE";
  //         }
  //         await this.runtime.messageManager.createMemory(responseMessage);
  //       }

  //       await this.runtime.processActions(
  //         message,
  //         responseMessages,
  //         state,
  //         callback
  //       );

  //       const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`;

  //       await this.runtime.cacheManager.set(
  //         `twitter/tweet_generation_${tweet.id}.txt`,
  //         responseInfo
  //       );
  //       await wait();
  //     } catch (error) {
  //       elizaLogger.error(`Error sending response tweet: ${error}`);
  //     }
  //   }
  // }

  // async buildConversationThread(
  //   tweet: Tweet,
  //   maxReplies: number = 10
  // ): Promise<Tweet[]> {
  //   const thread: Tweet[] = [];
  //   const visited: Set<string> = new Set();

  //   async function processThread(currentTweet: Tweet, depth: number = 0) {
  //     elizaLogger.log("Processing tweet:", {
  //       id: currentTweet.id,
  //       inReplyToStatusId: currentTweet.inReplyToStatusId,
  //       depth: depth,
  //     });

  //     if (!currentTweet) {
  //       elizaLogger.log("No current tweet found for thread building");
  //       return;
  //     }

  //     if (depth >= maxReplies) {
  //       elizaLogger.log("Reached maximum reply depth", depth);
  //       return;
  //     }

  //     // Handle memory storage
  //     const memory = await this.runtime.messageManager.getMemoryById(
  //       stringToUuid(currentTweet.id + "-" + this.runtime.agentId)
  //     );
  //     if (!memory) {
  //       const roomId = stringToUuid(
  //         currentTweet.conversationId + "-" + this.runtime.agentId
  //       );
  //       const userId = stringToUuid(currentTweet.userId);

  //       await this.runtime.ensureConnection(
  //         userId,
  //         roomId,
  //         currentTweet.username,
  //         currentTweet.name,
  //         "twitter"
  //       );

  //       this.runtime.messageManager.createMemory({
  //         id: stringToUuid(currentTweet.id + "-" + this.runtime.agentId),
  //         agentId: this.runtime.agentId,
  //         content: {
  //           text: currentTweet.text,
  //           source: "twitter",
  //           url: currentTweet.permanentUrl,
  //           inReplyTo: currentTweet.inReplyToStatusId
  //             ? stringToUuid(
  //                 currentTweet.inReplyToStatusId + "-" + this.runtime.agentId
  //               )
  //             : undefined,
  //         },
  //         createdAt: currentTweet.timestamp * 1000,
  //         roomId,
  //         userId:
  //           currentTweet.userId === this.twitterUserId
  //             ? this.runtime.agentId
  //             : stringToUuid(currentTweet.userId),
  //         embedding: getEmbeddingZeroVector(),
  //       });
  //     }

  //     if (visited.has(currentTweet.id)) {
  //       elizaLogger.log("Already visited tweet:", currentTweet.id);
  //       return;
  //     }

  //     visited.add(currentTweet.id);
  //     thread.unshift(currentTweet);

  //     elizaLogger.debug("Current thread state:", {
  //       length: thread.length,
  //       currentDepth: depth,
  //       tweetId: currentTweet.id,
  //     });

  //     if (currentTweet.inReplyToStatusId) {
  //       elizaLogger.log(
  //         "Fetching parent tweet:",
  //         currentTweet.inReplyToStatusId
  //       );
  //       try {
  //         const parentTweet = await this.twitterClient.getTweet(
  //           currentTweet.inReplyToStatusId
  //         );

  //         if (parentTweet) {
  //           elizaLogger.log("Found parent tweet:", {
  //             id: parentTweet.id,
  //             text: parentTweet.text?.slice(0, 50),
  //           });
  //           await processThread(parentTweet, depth + 1);
  //         } else {
  //           elizaLogger.log(
  //             "No parent tweet found for:",
  //             currentTweet.inReplyToStatusId
  //           );
  //         }
  //       } catch (error) {
  //         elizaLogger.log("Error fetching parent tweet:", {
  //           tweetId: currentTweet.inReplyToStatusId,
  //           error,
  //         });
  //       }
  //     } else {
  //       elizaLogger.log("Reached end of reply chain at:", currentTweet.id);
  //     }
  //   }

  //   // Need to bind this context for the inner function
  //   await processThread.bind(this)(tweet, 0);

  //   elizaLogger.debug("Final thread built:", {
  //     totalTweets: thread.length,
  //     tweetIds: thread.map((t) => ({
  //       id: t.id,
  //       text: t.text?.slice(0, 50),
  //     })),
  //   });

  //   return thread;
  // }
}
